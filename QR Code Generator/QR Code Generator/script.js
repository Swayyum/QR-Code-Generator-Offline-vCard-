/*
Copyright © 2025 Sam Analytic Solutions
All rights reserved.
*/
(function () {
  'use strict';

  const QR_BYTE_CAPACITY = {
    L: 2950,
    M: 2330,
    Q: 1660,
    H: 1270,
  };

  function escapeVCardValue(value) {
    if (!value) return '';
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\n|\r\n?/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function foldVCardLine(line) {
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
      const adr = ['', '', escapeVCardValue(street), escapeVCardValue(city), escapeVCardValue(region), escapeVCardValue(postalCode), escapeVCardValue(country)].join(';');
      lines.push('ADR;TYPE=WORK:' + adr);
    }

    if (note) lines.push('NOTE:' + escapeVCardValue(note));

    // PHOTO handling (local only)
    if (fields.photoDataUrl && fields.includePhotoInVcf) {
      const [meta, b64] = fields.photoDataUrl.split(',');
      const isJpeg = /image\/jpeg/i.test(meta);
      const type = isJpeg ? 'JPEG' : 'PNG';
      const photoLine = `PHOTO;ENCODING=b;TYPE=${type}:${b64}`;
      const folded = foldVCardLine(photoLine);
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
  const qrErrorEl = $('qrError');

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
  const hostedVcfUrlInput = $('hostedVcfUrl');
  const useHostedVcfUrlInput = $('useHostedVcfUrl');
  const errHostedVcfUrl = $('err-hostedVcfUrl');

  let qrInstance = null;
  let currentPhotoDataUrl = '';
  let originalPhotoFile = null;
  let isAutoCompressing = false;

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
      hostedVcfUrl: (hostedVcfUrlInput?.value || '').trim(),
      useHostedVcfUrl: useHostedVcfUrlInput?.checked || false,
      street: $('street').value,
      city: $('city').value,
      region: $('region').value,
      postalCode: $('postalCode').value,
      country: $('country').value,
      note: $('note').value,
      photoDataUrl: currentPhotoDataUrl,
      includePhotoInVcf: includePhotoInVcfInput?.checked || false,
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
    const hostedVcfUrl = hostedVcfUrlInput?.value.trim();

    const hasName = (first.value.trim() || last.value.trim() || full.value.trim());
    setFieldValidity(full, !!hasName, 'Enter at least one of First, Last, or Display name', errName);
    if (!hasName) { first.classList.add('invalid'); last.classList.add('invalid'); } else { first.classList.remove('invalid'); last.classList.remove('invalid'); }

    const emailOk = isValidEmail(email.value.trim());
    setFieldValidity(email, emailOk, 'Enter a valid email (e.g., name@example.com)', errEmail);

    const phoneMOk = isValidPhone(phoneM.value.trim());
    setFieldValidity(phoneM, phoneMOk, 'Enter 7–15 digits (you can include +, spaces, -)', errPhoneMobile);

    const phoneWOk = isValidPhone(phoneW.value.trim());
    setFieldValidity(phoneW, phoneWOk, 'Enter 7–15 digits (you can include +, spaces, -)', errPhoneWork);

    const siteOk = isValidWebsite(website.value.trim());
    setFieldValidity(website, siteOk, 'Enter a valid URL starting with http:// or https://', errWebsite);

    let hostedUrlOk = true;
    if (useHostedVcfUrlInput?.checked) {
      hostedUrlOk = isValidWebsite(hostedVcfUrl);
    }
    setFieldValidity(hostedVcfUrlInput, hostedUrlOk, 'Enter a valid https:// URL to a .vcf file', errHostedVcfUrl);

    return hasName && emailOk && phoneMOk && phoneWOk && siteOk && hostedUrlOk;
  }

  function updateQr(vcard) {
    const size = Math.max(128, Math.min(1024, parseInt($('qrSize').value || '320', 10)));
    let levelKey = ($('qrLevel').value || 'M').toUpperCase();
    const colorDark = $('darkColor').value || '#000000';
    const colorLight = $('lightColor').value || '#ffffff';

    // Capacity guard with auto-lowering ECC if needed
    let capacity = QR_BYTE_CAPACITY[levelKey] || QR_BYTE_CAPACITY.M;
    if (vcard.length > capacity) {
      const order = ['H','Q','M','L'];
      const idx = order.indexOf(levelKey);
      for (let i = idx + 1; i < order.length; i++) {
        const candidate = order[i];
        const cap = QR_BYTE_CAPACITY[candidate];
        if (vcard.length <= cap) {
          levelKey = candidate;
          capacity = cap;
          $('qrLevel').value = candidate;
          if (qrErrorEl) qrErrorEl.textContent = '';
          break;
        }
      }
    }

    if (vcard.length > capacity) {
      qrContainer.innerHTML = '';
      if (qrErrorEl) {
        qrErrorEl.textContent = `QR payload too large for level ${levelKey}. Consider reducing image size/quality or disabling embedding.`;
      }
      return;
    } else if (qrErrorEl) {
      qrErrorEl.textContent = '';
    }

    if (!window.QRCode) {
      vcardPreviewEl.textContent = 'Error: QR library not loaded.';
      return;
    }

    try {
      qrContainer.innerHTML = '';
      qrInstance = new window.QRCode(qrContainer, {
        text: vcard,
        width: size,
        height: size,
        colorDark: colorDark,
        colorLight: colorLight,
        correctLevel: window.QRCode.CorrectLevel[levelKey] || window.QRCode.CorrectLevel.M
      });
    } catch (e) {
      qrContainer.innerHTML = '';
      if (qrErrorEl) {
        qrErrorEl.textContent = 'Failed to render QR. Try reducing payload or changing options.';
      }
    }
  }

  function updateAll() {
    const fields = getFieldsFromForm();
    const formValid = validateAndDisplay();

    // If using a hosted .vcf URL for QR payload, prefer it directly
    if (useHostedVcfUrlInput?.checked && fields.hostedVcfUrl) {
      vcardPreviewEl.textContent = 'QR content: ' + fields.hostedVcfUrl;
      payloadLengthEl.textContent = fields.hostedVcfUrl.length.toString();
      updateQr(fields.hostedVcfUrl);
      downloadPngBtn.disabled = !formValid;
      downloadVcfBtn.disabled = !formValid;
      copyVcardBtn.disabled = !formValid;
      return;
    }

    // Decide PHOTO inclusion for QR vCard (local only)
    let effectiveFields = { ...fields };
    if (embedPhotoInQrInput?.checked) {
      if (!fields.includePhotoInVcf && fields.photoDataUrl) {
        effectiveFields = { ...effectiveFields, includePhotoInVcf: true };
      }
    } else {
      effectiveFields = { ...effectiveFields, includePhotoInVcf: false, photoDataUrl: '' };
    }

    let vcard = buildVCard(effectiveFields);

    // Attempt auto-compress to fit capacity when embedding photo data
    const levelKey = ($('qrLevel').value || 'M').toUpperCase();
    const capacity = QR_BYTE_CAPACITY[levelKey] || QR_BYTE_CAPACITY.M;
    if (embedPhotoInQrInput?.checked && currentPhotoDataUrl && vcard.length > capacity) {
      attemptAutoCompressToFit(levelKey).catch(() => {/* noop */});
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
    const vcard = embedPhotoInQrInput?.checked
      ? buildVCard({ ...fields, includePhotoInVcf: true })
      : buildVCard({ ...fields, includePhotoInVcf: false, photoDataUrl: '' });
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
    originalPhotoFile = null;
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

  function resizeImageFromSourceToDataUrl(source, maxDim, jpegQuality) {
    return new Promise((resolve, reject) => {
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
        const type = 'image/jpeg';
        const dataUrl = canvas.toDataURL(type, Math.min(0.95, Math.max(0.4, jpegQuality || 0.8)));
        resolve(dataUrl);
      };
      img.onerror = reject;

      if (typeof source === 'string') {
        img.src = source;
      } else if (source && typeof source === 'object') {
        const reader = new FileReader();
        reader.onload = () => { img.src = reader.result; };
        reader.onerror = reject;
        reader.readAsDataURL(source);
      } else {
        reject(new Error('Unsupported image source'));
      }
    });
  }

  async function onPhotoSelected(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) { setPhoto(''); originalPhotoFile = null; updateAll(); return; }
    originalPhotoFile = file;
    const maxDim = parseInt(photoMaxDimInput.value || '512', 10);
    const quality = parseFloat(photoQualityInput.value || '0.8');
    try {
      const dataUrl = await resizeImageToDataUrl(file, Math.max(64, Math.min(1024, maxDim)), quality);
      setPhoto(dataUrl);
      if (embedPhotoInQrInput) embedPhotoInQrInput.checked = true;
      if (includePhotoInVcfInput) includePhotoInVcfInput.checked = true;
      updateAll();
    } catch (e) {
      setPhoto('');
      updateAll();
    }
  }

  async function recompressFromOriginal() {
    if (!originalPhotoFile) return;
    const maxDim = parseInt(photoMaxDimInput.value || '512', 10);
    const quality = parseFloat(photoQualityInput.value || '0.8');
    try {
      const dataUrl = await resizeImageFromSourceToDataUrl(originalPhotoFile, Math.max(64, Math.min(1024, maxDim)), quality);
      setPhoto(dataUrl);
      updateAll();
    } catch (_) {
      // ignore
    }
  }

  async function attemptAutoCompressToFit(levelKey) {
    if (isAutoCompressing) return;
    if (!embedPhotoInQrInput?.checked || !currentPhotoDataUrl) return;

    const capacity = QR_BYTE_CAPACITY[levelKey] || QR_BYTE_CAPACITY.M;
    const fieldsBase = getFieldsFromForm();

    let v = buildVCard({ ...fieldsBase, includePhotoInVcf: true });
    if (v.length <= capacity) return;

    isAutoCompressing = true;
    try {
      const startDim = parseInt(photoMaxDimInput.value || '512', 10);
      const startQ = parseFloat(photoQualityInput.value || '0.8');
      const dimCandidates = Array.from(new Set([
        startDim,
        Math.round(startDim * 0.85),
        Math.round(startDim * 0.7),
        512, 448, 384, 352, 320, 288, 256, 224, 192, 160, 144, 128, 96, 80, 64
      ])).filter(d => d >= 64 && d <= 1024);
      const qCandidates = Array.from(new Set([
        startQ,
        Math.max(0.75, startQ - 0.1),
        Math.max(0.65, startQ - 0.2),
        0.6, 0.55, 0.5, 0.45, 0.4
      ])).filter(q => q >= 0.4 && q <= 0.95);

      for (const d of dimCandidates) {
        for (const q of qCandidates) {
          try {
            const src = originalPhotoFile || currentPhotoDataUrl;
            const dataUrl = await resizeImageFromSourceToDataUrl(src, d, q);
            setPhoto(dataUrl);
            const v2 = buildVCard({ ...getFieldsFromForm(), includePhotoInVcf: true });
            if (v2.length <= capacity) {
              photoMaxDimInput.value = String(d);
              photoQualityInput.value = String(q);
              updateAll();
              return;
            }
          } catch (_) {
            // try next combo
          }
        }
      }
      updateAll();
    } finally {
      isAutoCompressing = false;
    }
  }

  function clearPhoto() {
    photoFileInput.value = '';
    setPhoto('');
    originalPhotoFile = null;
    updateAll();
  }

  form.addEventListener('input', updateAll);
  form.addEventListener('change', updateAll);
  downloadPngBtn.addEventListener('click', downloadPng);
  downloadVcfBtn.addEventListener('click', downloadVcf);
  copyVcardBtn.addEventListener('click', copyVcard);
  resetBtn.addEventListener('click', resetForm);

  photoFileInput.addEventListener('change', onPhotoSelected);
  clearPhotoBtn.addEventListener('click', clearPhoto);
  photoMaxDimInput.addEventListener('change', () => { if (currentPhotoDataUrl) { recompressFromOriginal(); } });
  photoQualityInput.addEventListener('change', () => { if (currentPhotoDataUrl) { recompressFromOriginal(); } });
  includePhotoInVcfInput.addEventListener('change', updateAll);
  embedPhotoInQrInput.addEventListener('change', updateAll);
  useHostedVcfUrlInput.addEventListener('change', updateAll);
  hostedVcfUrlInput.addEventListener('input', updateAll);

  document.addEventListener('DOMContentLoaded', updateAll);
  updateAll();
})(); 