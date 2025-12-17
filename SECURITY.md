# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in blake3-bao, please report it by:

1. **Email**: Open an issue on GitHub with the title "SECURITY" (without details)
2. **GitHub Security Advisory**: Use [GitHub's security advisory feature](https://github.com/lamb356/blake3-optimized/security/advisories/new)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and work with you to understand and address the issue.

## Security Considerations

### Cryptographic Implementation

This library implements:
- **BLAKE3** - Following the [official specification](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)
- **Bao** - Following the [Bao specification](https://github.com/oconnor663/bao/blob/master/docs/spec.md)

### Important Notes

1. **Not audited**: This implementation has not been professionally audited. For high-security applications, consider using audited implementations.

2. **Timing attacks**: Hash comparisons use constant-time comparison (`constantTimeEqual`) to prevent timing side-channel attacks.

3. **WASM SIMD**: The optional WASM SIMD acceleration does not affect security, only performance.

4. **Browser usage**: When using in browsers, ensure you're loading the library over HTTPS.

5. **Key management**: For keyed hashing (`hashKeyed`) and key derivation (`deriveKey`):
   - Keys must be exactly 32 bytes
   - Use cryptographically secure random number generators for key generation
   - Never reuse keys across different contexts

6. **Verification**: Always verify data using the root hash before trusting it:
   ```javascript
   // Good - verify before use
   const decoded = baoDecode(encoded, expectedHash);

   // Bad - using data without verification
   const data = encoded.slice(8); // Don't do this!
   ```

### Test Coverage

- 1,158 tests including official Bao test vectors
- Cross-validated against Python reference implementations
- Tested on multiple platforms (Node.js, browsers)

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Dependencies

This library has minimal dependencies:
- **Runtime**: Zero dependencies (pure JavaScript)
- **Dev**: webpack, terser-webpack-plugin (build only)

All dependencies are regularly audited via `npm audit`.
