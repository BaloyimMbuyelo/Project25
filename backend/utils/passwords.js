const crypto = require('crypto');

// Password policy (System Design 4.8.2, SEC-01): at least 8 characters with
// upper-case, lower-case and a digit, and not a commonly used password.

const COMMON_PASSWORDS = new Set([
    'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd',
    'qwerty123', 'qwertyuiop', 'abc12345', 'abcd1234', 'letmein1', 'welcome1',
    'welcome123', 'admin123', 'administrator', 'iloveyou1', 'monkey123',
    'football1', 'sunshine1', 'princess1', 'dragon123', 'baseball1', 'master123',
    '12345678', '123456789', '1234567890', '11111111', '00000000',
    'ubuntu123', 'bistro123', 'restaurant1', 'southafrica1', 'capetown1'
]);

const POLICY_MESSAGE = 'Password must be at least 8 characters with an upper-case letter, a lower-case letter and a number.';

function passwordProblem(password) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
        return password && password.length > 72 ? 'Password must be 72 characters or fewer.' : POLICY_MESSAGE;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        return POLICY_MESSAGE;
    }
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        return 'This password is too common. Choose a different one.';
    }
    return null;
}

// Temporary password for new staff and resets (P11): 12 characters that
// always satisfy the policy, without look-alike characters.
function randomPassword(length = 12) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const all = upper + lower + digits;

    const pick = (set) => set[crypto.randomInt(set.length)];
    const chars = [pick(upper), pick(lower), pick(digits)];
    while (chars.length < length) chars.push(pick(all));

    // Fisher-Yates shuffle
    for (let i = chars.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

module.exports = { passwordProblem, randomPassword, POLICY_MESSAGE };
