// Profile-field validators.
//
// Each of these follows the exact same shape: type-check -> trim ->
// required-check -> max-length-check -> return {valid, error}. They were
// added one field at a time over several sprints by copy-pasting the
// previous validator and swapping the field name / max length / error
// string, rather than extracting a single parameterized validator once the
// pattern repeated. None of them differ in any way that isn't purely
// cosmetic (field name, error text, max length constant).

function validateFirstName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'firstName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'firstName is required' };
  if (trimmed.length > 50) return { valid: false, error: 'firstName is too long' };
  return { valid: true, error: null };
}

function validateLastName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'lastName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'lastName is required' };
  if (trimmed.length > 50) return { valid: false, error: 'lastName is too long' };
  return { valid: true, error: null };
}

function validateMiddleName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'middleName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'middleName is required' };
  if (trimmed.length > 50) return { valid: false, error: 'middleName is too long' };
  return { valid: true, error: null };
}

function validateNickName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'nickName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'nickName is required' };
  if (trimmed.length > 50) return { valid: false, error: 'nickName is too long' };
  return { valid: true, error: null };
}

function validateDisplayName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'displayName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'displayName is required' };
  if (trimmed.length > 100) return { valid: false, error: 'displayName is too long' };
  return { valid: true, error: null };
}

function validateCompanyName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'companyName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'companyName is required' };
  if (trimmed.length > 100) return { valid: false, error: 'companyName is too long' };
  return { valid: true, error: null };
}

function validateJobTitle(value) {
  if (typeof value !== 'string') return { valid: false, error: 'jobTitle must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'jobTitle is required' };
  if (trimmed.length > 80) return { valid: false, error: 'jobTitle is too long' };
  return { valid: true, error: null };
}

function validateDepartment(value) {
  if (typeof value !== 'string') return { valid: false, error: 'department must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'department is required' };
  if (trimmed.length > 80) return { valid: false, error: 'department is too long' };
  return { valid: true, error: null };
}

function validateAddressLine1(value) {
  if (typeof value !== 'string') return { valid: false, error: 'addressLine1 must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'addressLine1 is required' };
  if (trimmed.length > 120) return { valid: false, error: 'addressLine1 is too long' };
  return { valid: true, error: null };
}

function validateAddressLine2(value) {
  if (typeof value !== 'string') return { valid: false, error: 'addressLine2 must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'addressLine2 is required' };
  if (trimmed.length > 120) return { valid: false, error: 'addressLine2 is too long' };
  return { valid: true, error: null };
}

function validateCity(value) {
  if (typeof value !== 'string') return { valid: false, error: 'city must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'city is required' };
  if (trimmed.length > 60) return { valid: false, error: 'city is too long' };
  return { valid: true, error: null };
}

function validateState(value) {
  if (typeof value !== 'string') return { valid: false, error: 'state must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'state is required' };
  if (trimmed.length > 40) return { valid: false, error: 'state is too long' };
  return { valid: true, error: null };
}

function validateZipCode(value) {
  if (typeof value !== 'string') return { valid: false, error: 'zipCode must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'zipCode is required' };
  if (trimmed.length > 20) return { valid: false, error: 'zipCode is too long' };
  return { valid: true, error: null };
}

function validateCountry(value) {
  if (typeof value !== 'string') return { valid: false, error: 'country must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'country is required' };
  if (trimmed.length > 60) return { valid: false, error: 'country is too long' };
  return { valid: true, error: null };
}

function validatePhoneNumber(value) {
  if (typeof value !== 'string') return { valid: false, error: 'phoneNumber must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'phoneNumber is required' };
  if (trimmed.length > 20) return { valid: false, error: 'phoneNumber is too long' };
  return { valid: true, error: null };
}

function validateFaxNumber(value) {
  if (typeof value !== 'string') return { valid: false, error: 'faxNumber must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'faxNumber is required' };
  if (trimmed.length > 20) return { valid: false, error: 'faxNumber is too long' };
  return { valid: true, error: null };
}

function validateMobileNumber(value) {
  if (typeof value !== 'string') return { valid: false, error: 'mobileNumber must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'mobileNumber is required' };
  if (trimmed.length > 20) return { valid: false, error: 'mobileNumber is too long' };
  return { valid: true, error: null };
}

function validateEmailAddress(value) {
  if (typeof value !== 'string') return { valid: false, error: 'emailAddress must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'emailAddress is required' };
  if (trimmed.length > 254) return { valid: false, error: 'emailAddress is too long' };
  return { valid: true, error: null };
}

function validateSecondaryEmail(value) {
  if (typeof value !== 'string') return { valid: false, error: 'secondaryEmail must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'secondaryEmail is required' };
  if (trimmed.length > 254) return { valid: false, error: 'secondaryEmail is too long' };
  return { valid: true, error: null };
}

function validateWebsite(value) {
  if (typeof value !== 'string') return { valid: false, error: 'website must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'website is required' };
  if (trimmed.length > 200) return { valid: false, error: 'website is too long' };
  return { valid: true, error: null };
}

function validateTwitterHandle(value) {
  if (typeof value !== 'string') return { valid: false, error: 'twitterHandle must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'twitterHandle is required' };
  if (trimmed.length > 15) return { valid: false, error: 'twitterHandle is too long' };
  return { valid: true, error: null };
}

function validateLinkedinUrl(value) {
  if (typeof value !== 'string') return { valid: false, error: 'linkedinUrl must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'linkedinUrl is required' };
  if (trimmed.length > 200) return { valid: false, error: 'linkedinUrl is too long' };
  return { valid: true, error: null };
}

function validateGithubUsername(value) {
  if (typeof value !== 'string') return { valid: false, error: 'githubUsername must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'githubUsername is required' };
  if (trimmed.length > 39) return { valid: false, error: 'githubUsername is too long' };
  return { valid: true, error: null };
}

function validateBio(value) {
  if (typeof value !== 'string') return { valid: false, error: 'bio must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'bio is required' };
  if (trimmed.length > 500) return { valid: false, error: 'bio is too long' };
  return { valid: true, error: null };
}

function validateTagline(value) {
  if (typeof value !== 'string') return { valid: false, error: 'tagline must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'tagline is required' };
  if (trimmed.length > 150) return { valid: false, error: 'tagline is too long' };
  return { valid: true, error: null };
}

function validateNotes(value) {
  if (typeof value !== 'string') return { valid: false, error: 'notes must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'notes is required' };
  if (trimmed.length > 1000) return { valid: false, error: 'notes is too long' };
  return { valid: true, error: null };
}

function validateReferenceCode(value) {
  if (typeof value !== 'string') return { valid: false, error: 'referenceCode must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'referenceCode is required' };
  if (trimmed.length > 40) return { valid: false, error: 'referenceCode is too long' };
  return { valid: true, error: null };
}

function validatePromoCode(value) {
  if (typeof value !== 'string') return { valid: false, error: 'promoCode must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'promoCode is required' };
  if (trimmed.length > 40) return { valid: false, error: 'promoCode is too long' };
  return { valid: true, error: null };
}

function validateCouponCode(value) {
  if (typeof value !== 'string') return { valid: false, error: 'couponCode must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'couponCode is required' };
  if (trimmed.length > 40) return { valid: false, error: 'couponCode is too long' };
  return { valid: true, error: null };
}

function validateProjectName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'projectName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'projectName is required' };
  if (trimmed.length > 80) return { valid: false, error: 'projectName is too long' };
  return { valid: true, error: null };
}

function validateTeamName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'teamName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'teamName is required' };
  if (trimmed.length > 80) return { valid: false, error: 'teamName is too long' };
  return { valid: true, error: null };
}

function validateRoleName(value) {
  if (typeof value !== 'string') return { valid: false, error: 'roleName must be a string' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, error: 'roleName is required' };
  if (trimmed.length > 60) return { valid: false, error: 'roleName is too long' };
  return { valid: true, error: null };
}

module.exports = {
  validateFirstName,
  validateLastName,
  validateMiddleName,
  validateNickName,
  validateDisplayName,
  validateCompanyName,
  validateJobTitle,
  validateDepartment,
  validateAddressLine1,
  validateAddressLine2,
  validateCity,
  validateState,
  validateZipCode,
  validateCountry,
  validatePhoneNumber,
  validateFaxNumber,
  validateMobileNumber,
  validateEmailAddress,
  validateSecondaryEmail,
  validateWebsite,
  validateTwitterHandle,
  validateLinkedinUrl,
  validateGithubUsername,
  validateBio,
  validateTagline,
  validateNotes,
  validateReferenceCode,
  validatePromoCode,
  validateCouponCode,
  validateProjectName,
  validateTeamName,
  validateRoleName,
};
