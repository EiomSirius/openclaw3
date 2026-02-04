# ClawHavoc - AMOS Stealer Campaign

**Threat Actor:** Unknown (financially motivated)  
**Campaign:** Supply chain attack via malicious ClawHub skills  
**Target:** macOS users  
**Impact:** Credential theft, cryptocurrency wallet theft, session hijacking

## Contents

| File | Description |
|------|-------------|
| `amos-stealer.yar` | YARA rules for binary + prompt injection detection |
| `prompt-injection-prevention.md` | Prevention guide for skill authors/operators |
| `iocs.txt` | IOCs (hashes, IPs, URLs) |
| `scripts/honeypot_c2.py` | C2 honeypot for research |

## Quick Start

### Block C2 Infrastructure
```
91.92.242.30
54.91.154.110
```

### Scan Skills for Injection
```bash
yara docs/security/clawhavoc/amos-stealer.yar /path/to/skills/
```

### Run Detection Scanner
```bash
# Check for prompt injection patterns
grep -riE "(ignore|disregard).*(previous|prior).*instruction" skills/
```

## References

- [Koi Security Scanner](https://clawdex.koi.security)
- [Unit221B Analysis](https://github.com/Unit221B/docs/tree/main/threat-intel/clawhavoc)

---
*Contributed by Unit221B - 2026-02-03*
