/**
 * WebLoad Security Subsystem: CSP-like `script-src` Allowlist Validator
 */

export class WebloadSecurityError extends TypeError {
	/**
	 * @param {string} targetUrl
	 * @param {string[]} scriptSrcRules
	 */
	constructor (targetUrl, scriptSrcRules) {
		const rulesFormatted = Array.isArray(scriptSrcRules) && scriptSrcRules.length > 0
			? scriptSrcRules.join(' ')
			: "'none'";
		const message = `Refused to load script from '${targetUrl}' because it violates the following script-src directive: ${rulesFormatted}`;
		super(message);
		this.name = 'WebloadSecurityError';
		this.targetUrl = targetUrl;
		this.scriptSrcRules = scriptSrcRules;
	}
}

/**
 * Logs a formatted security violation message and constructs WebloadSecurityError.
 * @param {string | URL} targetUrl
 * @param {string[] | undefined | null} scriptSrcRules
 * @returns {WebloadSecurityError}
 */
export function reportSecurityViolation (targetUrl, scriptSrcRules) {
	const urlStr = typeof targetUrl === 'string' ? targetUrl : targetUrl.href;
	const rulesFormatted = Array.isArray(scriptSrcRules) && scriptSrcRules.length > 0
		? scriptSrcRules.join(' ')
		: "'none'";

	console.error(
		`[webload:security] Security Violation: Refused to load script from '${urlStr}'. ` +
		`Active script-src directive: [${rulesFormatted}]`
	);

	return new WebloadSecurityError(urlStr, scriptSrcRules || []);
}

/**
 * Parsed representation of a source expression.
 * @typedef {Object} ParsedSourceRule
 * @property {string | null} scheme - e.g. "https:" or "http:"
 * @property {string | null} host - e.g. "esm.sh", or "*.esm.sh"
 * @property {boolean} isWildcard - whether the host has a wildcard subdomain
 * @property {string | null} baseHost - the domain part without wildcard prefix (e.g. "esm.sh")
 * @property {string | null} port - e.g. "3000" or null
 * @property {string | null} pathPrefix - e.g. "/v135/" or null
 */

/**
 * Parses a single source expression string into a structured descriptor.
 * @param {string} expr - e.g. "https:", "esm.sh", "*.esm.sh", "https://*.unpkg.com", "http://localhost:3000/api/"
 * @returns {ParsedSourceRule}
 */
export function parseSourceExpression (expr) {
	if (typeof expr !== 'string') {
		throw new TypeError(`Source expression must be a string, got ${typeof expr}`);
	}

	const trimmed = expr.trim();
	if (!trimmed) {
		throw new TypeError('Source expression cannot be empty');
	}

	// Scheme-only rule: e.g. "https:", "http:", "https"
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:?$/.test(trimmed) && (trimmed.endsWith(':') || trimmed === 'https' || trimmed === 'http')) {
		const scheme = trimmed.endsWith(':') ? trimmed.toLowerCase() : `${trimmed.toLowerCase()}:`;
		return {
			scheme,
			host: null,
			isWildcard: false,
			baseHost: null,
			port: null,
			pathPrefix: null
		};
	}

	let raw = trimmed;
	let scheme = null;

	// Check if scheme is specified (e.g., "https://...")
	const schemeMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/);
	if (schemeMatch) {
		scheme = `${schemeMatch[1].toLowerCase()}:`;
		raw = schemeMatch[2];
	}

	// Split host and path
	const slashIdx = raw.indexOf('/');
	let hostPart = slashIdx !== -1 ? raw.slice(0, slashIdx) : raw;
	let pathPrefix = slashIdx !== -1 ? raw.slice(slashIdx) : null;

	if (pathPrefix && !pathPrefix.startsWith('/')) {
		pathPrefix = `/${pathPrefix}`;
	}

	// Extract port if present
	let port = null;
	const portMatch = hostPart.match(/^(.*):(\d+|\*)$/);
	if (portMatch) {
		hostPart = portMatch[1];
		port = portMatch[2];
	}

	hostPart = hostPart.toLowerCase();

	let isWildcard = false;
	let baseHost = null;

	if (hostPart.startsWith('*.')) {
		isWildcard = true;
		baseHost = hostPart.slice(2);
	} else if (hostPart.startsWith('*')) {
		isWildcard = true;
		baseHost = hostPart.slice(1);
	} else {
		baseHost = hostPart;
	}

	return {
		scheme,
		host: hostPart,
		isWildcard,
		baseHost: baseHost || null,
		port,
		pathPrefix
	};
}

/**
 * Matches a URL against a single source rule.
 * @param {string | URL} targetUrl
 * @param {string | ParsedSourceRule} sourceRule
 * @returns {boolean}
 */
export function matchSourceExpression (targetUrl, sourceRule) {
	let urlObj;
	try {
		urlObj = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
	} catch {
		return false;
	}

	const rule = typeof sourceRule === 'string' ? parseSourceExpression(sourceRule) : sourceRule;

	// 1. Check scheme
	if (rule.scheme) {
		if (urlObj.protocol.toLowerCase() !== rule.scheme.toLowerCase()) {
			return false;
		}
	} else if (rule.host === null) {
		// If no host and no scheme, it's invalid
		return false;
	}

	// If scheme-only rule (host is null), matching scheme is sufficient
	if (rule.host === null) {
		return true;
	}

	// 2. Check port
	if (rule.port !== null && rule.port !== '*') {
		const urlPort = urlObj.port || (urlObj.protocol === 'https:' ? '443' : urlObj.protocol === 'http:' ? '80' : '');
		const rulePort = rule.port;
		if (urlPort !== rulePort) {
			return false;
		}
	}

	// 3. Check host
	const targetHost = urlObj.hostname.toLowerCase();
	if (rule.isWildcard && rule.baseHost) {
		const base = rule.baseHost.toLowerCase();
		// Wildcard matches subdomains (e.g. *.esm.sh matches cdn.esm.sh, a.b.esm.sh)
		if (!targetHost.endsWith(`.${base}`)) {
			return false;
		}
	} else if (rule.host) {
		if (targetHost !== rule.host.toLowerCase()) {
			return false;
		}
	}

	// 4. Check path prefix
	if (rule.pathPrefix) {
		if (!urlObj.pathname.startsWith(rule.pathPrefix)) {
			return false;
		}
	}

	return true;
}

/**
 * Checks if targetUrl satisfies the script-src rules without throwing.
 * @param {string | URL} targetUrl
 * @param {string[] | undefined | null} scriptSrcRules
 * @returns {boolean}
 */
export function isAllowedScriptSrc (targetUrl, scriptSrcRules) {
	if (!Array.isArray(scriptSrcRules) || scriptSrcRules.length === 0) {
		return false;
	}

	let parsedRules;
	try {
		parsedRules = scriptSrcRules.map(function (r) { return parseSourceExpression(r); });
	} catch {
		return false;
	}

	for (const rule of parsedRules) {
		if (matchSourceExpression(targetUrl, rule)) {
			return true;
		}
	}

	return false;
}

/**
 * Validates a target URL against script-src rules.
 * Throws WebloadSecurityError (subclass of TypeError) if validation fails.
 * @param {string | URL} targetUrl
 * @param {string[] | undefined | null} scriptSrcRules
 * @returns {boolean}
 */
export function validateScriptSrc (targetUrl, scriptSrcRules) {
	const urlStr = typeof targetUrl === 'string' ? targetUrl : targetUrl?.href;

	if (!isAllowedScriptSrc(urlStr, scriptSrcRules)) {
		throw reportSecurityViolation(urlStr, scriptSrcRules);
	}

	return true;
}
