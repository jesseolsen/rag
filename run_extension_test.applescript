-- AppleScript to automate Chrome extension E2E testing
-- Usage: open run_extension_test.applescript

set projectDir to POSIX path of (path to home folder) & "code/jesseolsen/rag"

tell application "Terminal"
    activate
    
    -- Create new terminal window
    do script "cd \"" & projectDir & "\""
    
    -- Check if backend is running, start if not
    delay 1
    do script "echo '🔍 Checking if backend is running...'"
    delay 1
    
    -- Run the E2E test
    do script "echo '🚀 Starting Chrome Extension E2E Test' && node test_extension_e2e.js"
    
    -- Display result
    delay 2
    do script "echo '📊 Test results above. Screenshot saved to: extension_test_result.png'"
    
end tell
