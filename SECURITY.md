# Security Policy

## Supported Versions

Only the latest stable release of `mcp-cli` is actively maintained and receives security updates.

| Version | Supported |
|---------|-----------|
| latest  | ✅        |

Older versions are not guaranteed to receive security patches.

---

## Reporting a Vulnerability

If you discover a security vulnerability in this project, **please do not create a public issue**. Instead, responsibly disclose it by following the steps below:

### 📬 Contact

Please email security reports directly to:

**📧 wong2.dev@gmail.com**

Include the following in your report (if available):

- A clear description of the vulnerability
- Steps to reproduce (PoC if possible)
- Affected versions
- Potential impact

You will receive an acknowledgment within **72 hours**, and we will aim to provide a fix or mitigation within **14 days**, depending on severity.

---

## Scope

This policy applies to:

- The CLI logic
- OAuth token handling
- Network communication (e.g., SSE, HTTP interactions)
- Any misbehavior that leads to code execution, privilege escalation, or leakage of sensitive data

It does **not** cover vulnerabilities in MCP servers not maintained by this repository.

---

## Credits

We appreciate responsible researchers and users who help improve the security of `mcp-cli`. Contributors will be publicly credited (if desired) once the vulnerability is resolved.

---

## Disclosure Timeline

We follow a [Coordinated Disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure) policy. Please give us a reasonable window to resolve the issue before making it public.
