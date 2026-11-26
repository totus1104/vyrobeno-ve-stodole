export const MAX_BYTES = 15_000_000;
export const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']);

export function validateContact({ fullName, email, phone }) {
  const errors = {};
  if (!fullName.trim()) errors.fullName = 'Vyplňte prosím jméno a příjmení.';
  if (!email.trim()) errors.email = 'Vyplňte prosím e-mail.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Zadejte platný e-mail, například jmeno@domena.cz.';
  const digits = phone.replace(/\D/g, '');
  if (phone.trim() && (!/^\+?[\d\s()\-]+$/.test(phone.trim()) || digits.length < 6 || digits.length > 15)) errors.phone = 'Zadejte platné telefonní číslo';
  return errors;
}

// Accepted files stay in memory only. Validate each addition against the running total.
export function addAttachments(existing, incoming) {
  const files = [...existing];
  const errors = [];
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of incoming) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (!file.name.includes('.') || !ALLOWED_EXTENSIONS.has(extension)) {
      errors.push(`Soubor „${file.name}“ má nepodporovaný formát. Vyberte PDF, JPG/JPEG, PNG, DOC nebo DOCX.`);
    } else if (total + file.size > MAX_BYTES) {
      errors.push(`Soubor „${file.name}“ nebyl přidán. Celková velikost příloh by překročila 15 MB (15 000 000 bajtů).`);
    } else {
      files.push(file);
      total += file.size;
    }
  }
  return { files, errors };
}
