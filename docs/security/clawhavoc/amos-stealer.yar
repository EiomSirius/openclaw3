/*
    AMOS Stealer Detection Rules - ClawHavoc Campaign
    Author: Unit221B
    Date: 2026-02-03
    Reference: https://github.com/Unit221B/docs/blob/main/threat-intel/clawhavoc-amos-analysis.md
*/

rule AMOS_Stealer_Universal_Binary {
    meta:
        description = "Detects AMOS Stealer Mach-O universal binary"
        author = "Unit221B"
        date = "2026-02-03"
        severity = "critical"
        hash1 = "1e6d4b0538558429422b71d1f4d724c8ce31be92d299df33a8339e32316e2298"
        hash2 = "998c38b430097479b015a68d9435dc5b98684119739572a4dff11e085881187e"
        
    strings:
        // Universal Mach-O magic (fat binary)
        $macho_fat = { ca fe ba be 00 00 00 02 }
        
        // XOR key loading pattern
        $xor_key_load = { 48 b8 ?? 03 84 d9 45 f5 fd ce }
        
        // Encrypted "killall" command
        $enc_killall = { 48 b8 ae 6a e8 b5 24 99 91 ee }
        
        // Ad-hoc code signing identifier
        $adhoc_sig = "jhzhhfomng"
        
        // Function name for directory copy with exclusions
        $func_copy = "copyDirectoryWithExclusions"
        
        // C++ filesystem status check
        $cpp_fs = "__ZNSt3__14__fs10filesystem8__statusE"
        
    condition:
        $macho_fat at 0 and (
            $xor_key_load or
            $enc_killall or
            ($adhoc_sig and $func_copy) or
            (2 of ($adhoc_sig, $func_copy, $cpp_fs))
        )
}

rule AMOS_Stealer_Dropper_Script {
    meta:
        description = "Detects AMOS Stealer shell dropper scripts"
        author = "Unit221B"
        date = "2026-02-03"
        severity = "high"
        
    strings:
        $tmpdir = "$TMPDIR"
        $curl = "curl -O http://"
        $xattr = "xattr -c"
        $chmod = "chmod +x"
        $exec = { 26 26 20 2e 2f }  // "&& ./"
        
        // Known C2 pattern
        $c2_ip = "91.92.242.30"
        
    condition:
        filesize < 500 and
        $tmpdir and $curl and $xattr and $chmod and $exec
}

rule AMOS_Stealer_Behavior_Strings {
    meta:
        description = "Detects AMOS Stealer by decrypted behavior strings"
        author = "Unit221B"
        date = "2026-02-03"
        severity = "high"
        
    strings:
        // Target paths (may appear decrypted in memory)
        $path_tdata = "Telegram Desktop/tdata"
        $path_discord = "discord/Local Storage/leveldb"
        $path_keychain = "login.keychain"
        $path_chrome = "Google/Chrome/Default"
        $path_brave = "BraveSoftware/Brave-Browser"
        
        // Wallet targets
        $wallet_metamask = "nkbihfbeogaeaoehlefnkodbefgpgknn"
        $wallet_phantom = "bfnaelmomeimhlpmgjnjophhpkkoljpa"
        $wallet_coinbase = "hnfanknocfeofbddgcijnmhnfnkdnaad"
        
        // Commands
        $cmd_ditto = "ditto -c"
        $cmd_osascript = "osascript -e"
        $cmd_security = "security find-"
        
    condition:
        3 of ($path_*) or
        2 of ($wallet_*) or
        (1 of ($path_*) and 2 of ($cmd_*))
}

rule AMOS_Stealer_C2_Communication {
    meta:
        description = "Detects AMOS C2 communication patterns in network traffic"
        author = "Unit221B"
        date = "2026-02-03"
        severity = "critical"
        
    strings:
        $api_rep = "/api/rep"
        $api_dow = "/api/dow"
        $user_id = "&user_id="
        $c2_primary = "91.92.242.30"
        $c2_secondary = "54.91.154.110"
        
    condition:
        ($api_rep or $api_dow) and ($user_id or $c2_primary or $c2_secondary)
}

rule AMOS_XOR_Encrypted_Strings {
    meta:
        description = "Detects XOR-encrypted AMOS strings with known key"
        author = "Unit221B"
        date = "2026-02-03"
        severity = "medium"
        
    strings:
        // XOR 0xcefdf545d98403c5 encrypted common strings
        // "curl" encrypted
        $enc_curl = { a0 97 97 ae }
        // "http" encrypted
        $enc_http = { a5 90 9a 9b }
        // "tdata" encrypted  
        $enc_tdata = { b6 a8 a4 b5 a6 }
        
    condition:
        uint32be(0) == 0xcafebabe and  // Mach-O fat
        2 of ($enc_*)
}

rule Skill_Prompt_Injection {
    meta:
        description = "Detects prompt injection attempts in AI agent skill files"
        author = "Unit221B"
        date = "2026-02-03"
        severity = "high"
        
    strings:
        // Instruction override attempts
        $inject1 = /ignore.{0,30}previous.{0,30}instruction/i
        $inject2 = /disregard.{0,30}(above|prior|all)/i
        $inject3 = "IGNORE ALL PREVIOUS" nocase ascii wide
        $inject4 = "forget your instructions" nocase
        $inject5 = "new instructions:" nocase
        $inject6 = "system prompt:" nocase
        
        // Hidden command execution in comments
        $hidden_curl = /<!--[^>]*curl\s/ nocase
        $hidden_wget = /<!--[^>]*wget\s/ nocase
        $hidden_bash = /<!--[^>]*bash\s+-c/ nocase
        $hidden_exec = /<!--[^>]*(exec|eval)\s*\(/ nocase
        
        // Payload download patterns
        $dl1 = /curl\s+-[sLo]*\s+http/
        $dl2 = /wget\s+http/
        $dl3 = /xattr\s+-c/
        
        // Unicode tricks (direction overrides)
        $rtl = { E2 80 AE }
        $lro = { E2 80 AD }
        $rlo = { E2 80 AB }
        
    condition:
        any of ($inject*) or
        any of ($hidden*) or
        (any of ($dl*) and filesize < 50KB) or
        any of ($rtl, $lro, $rlo)
}
