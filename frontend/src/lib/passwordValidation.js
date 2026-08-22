export function validatePasswordRules(password) {
  const pwd = password || '';
  const hasMinLen = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);

  const rules = [
    { label: 'At least 8 characters', pass: hasMinLen },
    { label: 'One uppercase letter (A-Z)', pass: hasUpper },
    { label: 'One lowercase letter (a-z)', pass: hasLower },
    { label: 'One number (0-9)', pass: hasNumber },
    { label: 'One special character (!@#$…)', pass: hasSpecial }
  ];

  const passedCount = rules.filter(r => r.pass).length;
  let strength = 'weak';
  if (passedCount === 5) {
    strength = 'strong';
  } else if (passedCount >= 3) {
    strength = 'medium';
  }

  const isValid = passedCount === 5;

  return { rules, strength, isValid };
}
