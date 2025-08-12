/*
Copyright © 2025 Sam Analytic Solutions
All rights reserved.
*/
(function () {
  'use strict';

  function escapeVCardValue(value) {
    if (!value) return '';
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\n|\r\n?/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function foldVCardLine(line) {
    // vCard folding: subsequent lines start with one space, limit 75 octets (approx chars)
    const max = 75;
    if (line.length <= max) return line;
    const parts = [];
    let i = 0;
    while (i < line.length) {
      const chunk = line.slice(i, i + (i === 0 ? max : max - 1));
      parts.push(i === 0 ? chunk : ' ' + chunk);
      i += (i === 0 ? max : max - 1);
    }
    return parts.join('\r\n');
  }

  function buildVCard(fields) {
    const firstName = fields.firstName?.trim() || '';
    const lastName = fields.lastName?.trim() || '';
    const fullName = (fields.fullName?.trim()) || [firstName, lastName].filter(Boolean).join(' ');

    const organization = fields.organization?.trim() || '';
    const title = fields.title?.trim() || '';

    const phoneMobile = fields.phoneMobile?.trim() || '';
    const phoneWork = fields.phoneWork?.trim() || '';
    const email = fields.email?.trim() || '';
    const website = fields.website?.trim() || '';

    const street = fields.street?.trim() || '';
    const city = fields.city?.trim() || '';
    const region = fields.region?.trim() || '';
    const postalCode = fields.postalCode?.trim() || '';
    const country = fields.country?.trim() || '';

    const note = fields.note?.trim() || '';

    const lines = [];
    lines.push('BEGIN:VCARD');
    lines.push('VERSION:3.0');

    lines.push('N:' + [escapeVCardValue(lastName), escapeVCardValue(firstName), '', '', ''].join(';'));
    lines.push('FN:' + escapeVCardValue(fullName));

    if (organization) lines.push('ORG:' + escapeVCardValue(organization));
    if (title) lines.push('TITLE:' + escapeVCardValue(title));

    if (phoneMobile) lines.push('TEL;TYPE=CELL:' + phoneMobile);
    if (phoneWork) lines.push('TEL;TYPE=WORK,VOICE:' + phoneWork);

    if (email) lines.push('EMAIL;TYPE=INTERNET:' + email);
    if (website) lines.push('URL:' + escapeVCardValue(website));

    if (street || city || region || postalCode || country) {
      const adr = ['','', escapeVCardValue(street), escapeVCardValue(city), escapeVCardValue(region), escapeVCardValue(postalCode), escapeVCardValue(country)].join(';');
      lines.push('ADR;TYPE=WORK:' + adr);
    }

    if (note) lines.push('NOTE:' + escapeVCardValue(note));

    // PHOTO embedding
    if (fields.photoDataUrl && fields.includePhotoInVcf) {
      const [meta, b64] = fields.photoDataUrl.split(',');
      const isJpeg = /image\/jpeg/i.test(meta);
      const type = isJpeg ? 'JPEG' : 'PNG';
      const photoLine = `PHOTO;ENCODING=b;TYPE=${type}:${b64}`;
      // Fold the line for RFC compliance
      const folded = foldVCardLine(photoLine);
      // Split on CRLF to push multiple folded lines
      folded.split('\r\n').forEach(l => lines.push(l));
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  function $(id) { return document.getElementById(id); }

  const form = $('vcard-form');
  const qrContainer = $('qrcode');
  const payloadLengthEl = $('payloadLength');
  const vcardPreviewEl = $('vcardPreview');

  const downloadPngBtn = $('downloadPngBtn');
  const downloadVcfBtn = $('downloadVcfBtn');
  const copyVcardBtn = $('copyVcardBtn');
  const resetBtn = $('resetBtn');

  const photoFileInput = $('photoFile');
  const photoPreviewImg = $('photoPreview');
  const photoMaxDimInput = $('photoMaxDim');
  const photoQualityInput = $('photoQuality');
  const includePhotoInVcfInput = $('includePhotoInVcf');
  const embedPhotoInQrInput = $('embedPhotoInQr');
  const clearPhotoBtn = $('clearPhotoBtn');

  const errName = $('err-name');
  const errEmail = $('err-email');
  const errPhoneMobile = $('err-phoneMobile');
  const errPhoneWork = $('err-phoneWork');
  const errWebsite = $('err-website');

  let qrInstance = null;
  let currentPhotoDataUrl = '';

  function getFieldsFromForm() {
    return {
      firstName: $('firstName').value,
      lastName: $('lastName').value,
      fullName: $('fullName').value,
      organization: $('organization').value,
      title: $('title').value,
      phoneMobile: $('phoneMobile').value,
      phoneWork: $('phoneWork').value,
      email: $('email').value,
      website: $('website').value,
      street: $('street').value,
      city: $('city').value,
      region: $('region').value,
      postalCode: $('postalCode').value,
      country: $('country').value,
      note: $('note').value,
      photoDataUrl: currentPhotoDataUrl,
      includePhotoInVcf: includePhotoInVcfInput?.checked || false
    };
  }

  function isValidEmail(value) {
    if (!value) return true;
    const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    return re.test(value);
  }

  function isValidPhone(value) {
    if (!value) return true;
    const digits = (value.replace(/[^0-9]/g, ''));
    return digits.length >= 7 && digits.length <= 15;
  }

  function isValidWebsite(value) {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function setFieldValidity(inputEl, isValid, errorMsg, errorEl) {
    if (!inputEl) return;
    if (isValid) {
      inputEl.classList.remove('invalid');
      if (errorEl) errorEl.textContent = '';
    } else {
      inputEl.classList.add('invalid');
      if (errorEl) errorEl.textContent = errorMsg || 'Invalid value';
    }
  }

  function validateAndDisplay() {
    const first = $('firstName');
    const last = $('lastName');
    const full = $('fullName');
    const email = $('email');
    const phoneM = $('phoneMobile');
    const phoneW = $('phoneWork');
    const website = $('website');

    const hasName = (first.value.trim() || last.value.trim() || full.value.trim());
    setFieldValidity(full, !!hasName, 'Enter at least one of First, Last, or Display name', errName);
    // Also mark first/last if missing
    if (!hasName) {
      first.classList.add('invalid');
      last.classList.add('invalid');
    } else {
      first.classList.remove('invalid');
      last.classList.remove('invalid');
    }

    const emailOk = isValidEmail(email.value.trim());
    setFieldValidity(email, emailOk, 'Enter a valid email (e.g., name@example.com)', errEmail);

    const phoneMOk = isValidPhone(phoneM.value.trim());
    setFieldValidity(phoneM, phoneMOk, 'Enter 7–15 digits (you can include +, spaces, -)', errPhoneMobile);

    const phoneWOk = isValidPhone(phoneW.value.trim());
    setFieldValidity(phoneW, phoneWOk, 'Enter 7–15 digits (you can include +, spaces, -)', errPhoneWork);

    const siteOk = isValidWebsite(website.value.trim());
    setFieldValidity(website, siteOk, 'Enter a valid URL starting with http:// or https://', errWebsite);

    return hasName && emailOk && phoneMOk && phoneWOk && siteOk;
  }

  function updateQr(vcard) {
    const size = Math.max(128, Math.min(1024, parseInt($('qrSize').value || '320', 10)));
    const levelKey = ($('qrLevel').value || 'M').toUpperCase();
    const colorDark = $('darkColor').value || '#000000';
    const colorLight = $('lightColor').value || '#ffffff';

    if (!window.QRCode) {
      vcardPreviewEl.textContent = 'Error: QR library not loaded.';
      return;
    }

    if (!qrInstance) {
      qrInstance = new window.QRCode(qrContainer, {
        text: vcard,
        width: size,
        height: size,
        colorDark: colorDark,
        colorLight: colorLight,
        correctLevel: window.QRCode.CorrectLevel[levelKey] || window.QRCode.CorrectLevel.M
      });
    } else {
      qrContainer.innerHTML = '';
      qrInstance = new window.QRCode(qrContainer, {
        text: vcard,
        width: size,
        height: size,
        colorDark: colorDark,
        colorLight: colorLight,
        correctLevel: window.QRCode.CorrectLevel[levelKey] || window.QRCode.CorrectLevel.M
      });
    }
  }

  function updateAll() {
    const fields = getFieldsFromForm();
    const formValid = validateAndDisplay();

    let vcard = buildVCard(fields);
    if (embedPhotoInQrInput?.checked) {
      if (!fields.includePhotoInVcf && fields.photoDataUrl) {
        vcard = buildVCard({ ...fields, includePhotoInVcf: true });
      }
    } else {
      vcard = buildVCard({ ...fields, includePhotoInVcf: false });
    }

    vcardPreviewEl.textContent = vcard;
    payloadLengthEl.textContent = vcard.length.toString();
    updateQr(vcard);

    downloadPngBtn.disabled = !formValid;
    downloadVcfBtn.disabled = !formValid;
    copyVcardBtn.disabled = !formValid;
  }

  function downloadPng() {
    const name = (($('fileName').value || 'contact').trim() || 'contact') + '.png';
    const img = qrContainer.querySelector('img');
    const canvas = qrContainer.querySelector('canvas');

    let dataUrl = '';
    if (canvas && canvas.toDataURL) {
      dataUrl = canvas.toDataURL('image/png');
    } else if (img && img.src) {
      dataUrl = img.src;
    }
    if (!dataUrl) return;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadVcf() {
    // Always respect includePhotoInVcf for the file content
    const fields = getFieldsFromForm();
    const vcard = buildVCard(fields);
    const name = (($('fileName').value || 'contact').trim() || 'contact') + '.vcf';
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyVcard() {
    const fields = getFieldsFromForm();
    // Follow current QR payload selection for copy
    const vcard = embedPhotoInQrInput?.checked ? buildVCard({ ...fields, includePhotoInVcf: true }) : buildVCard({ ...fields, includePhotoInVcf: false });
    try {
      await navigator.clipboard.writeText(vcard);
      copyVcardBtn.textContent = 'Copied!';
      setTimeout(() => (copyVcardBtn.textContent = 'Copy vCard'), 1200);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = vcard;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function resetForm() {
    form.reset();
    setPhoto('');
    updateAll();
  }

  function setPhoto(dataUrl) {
    currentPhotoDataUrl = dataUrl || '';
    if (currentPhotoDataUrl) {
      photoPreviewImg.src = currentPhotoDataUrl;
    } else {
      photoPreviewImg.removeAttribute('src');
    }
  }

  function resizeImageToDataUrl(file, maxDim, jpegQuality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Output as JPEG for better QR payload size unless original is PNG and user wants PNG
          const type = 'image/jpeg';
          const dataUrl = canvas.toDataURL(type, Math.min(0.95, Math.max(0.4, jpegQuality || 0.8)));
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onPhotoSelected(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) { setPhoto(''); updateAll(); return; }
    const maxDim = parseInt(photoMaxDimInput.value || '512', 10);
    const quality = parseFloat(photoQualityInput.value || '0.8');
    try {
      const dataUrl = await resizeImageToDataUrl(file, Math.max(128, Math.min(1024, maxDim)), quality);
      setPhoto(dataUrl);
      updateAll();
    } catch (e) {
      setPhoto('');
      updateAll();
    }
  }

  function clearPhoto() {
    photoFileInput.value = '';
    setPhoto('');
    updateAll();
  }

  // Bind events
  form.addEventListener('input', updateAll);
  form.addEventListener('change', updateAll);
  downloadPngBtn.addEventListener('click', downloadPng);
  downloadVcfBtn.addEventListener('click', downloadVcf);
  copyVcardBtn.addEventListener('click', copyVcard);
  resetBtn.addEventListener('click', resetForm);

  photoFileInput.addEventListener('change', onPhotoSelected);
  clearPhotoBtn.addEventListener('click', clearPhoto);
  photoMaxDimInput.addEventListener('change', () => { if (currentPhotoDataUrl) updateAll(); });
  photoQualityInput.addEventListener('change', () => { if (currentPhotoDataUrl) updateAll(); });
  includePhotoInVcfInput.addEventListener('change', updateAll);
  embedPhotoInQrInput.addEventListener('change', updateAll);

  document.addEventListener('DOMContentLoaded', updateAll);
  updateAll();
})(); 