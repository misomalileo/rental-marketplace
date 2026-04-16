// ======================================
// Digital Lease Agreements
// ======================================

// Helper: show modal (custom, no alerts)
function showLeaseModal(message, type = 'info', onConfirm = null, onCancel = null) {
  const overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay';
  let icon = '<i class="fas fa-info-circle"></i>';
  let title = 'Information';
  if (type === 'success') { icon = '<i class="fas fa-check-circle" style="color: #10b981;"></i>'; title = 'Success'; }
  else if (type === 'error') { icon = '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>'; title = 'Error'; }
  else if (type === 'confirm') { icon = '<i class="fas fa-question-circle" style="color: #f59e0b;"></i>'; title = 'Confirmation'; }
  overlay.innerHTML = `<div class="custom-modal">${icon}<h3>${title}</h3><p>${message}</p><div class="custom-modal-buttons">${type === 'confirm' ? '<button class="custom-modal-btn confirm">Yes, Proceed</button><button class="custom-modal-btn cancel">Cancel</button>' : '<button class="custom-modal-btn confirm">OK</button>'}</div></div>`;
  document.body.appendChild(overlay);
  const confirmBtn = overlay.querySelector('.confirm');
  const cancelBtn = overlay.querySelector('.cancel');
  confirmBtn?.addEventListener('click', () => { overlay.remove(); if (onConfirm) onConfirm(); });
  cancelBtn?.addEventListener('click', () => { overlay.remove(); if (onCancel) onCancel(); });
}

async function generateLease(bookingId) {
  const res = await fetch(`/api/leases/generate/${bookingId}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
  });
  const data = await res.json();
  if (res.ok) {
    openLeaseModal(data.leaseId, data.pdfUrl);
  } else {
    showLeaseModal('Failed to generate lease', 'error');
  }
}

function openLeaseModal(leaseId, pdfUrl) {
  const existingModal = document.getElementById('leaseModal');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div id="leaseModal" class="modal">
      <div class="modal-content" style="max-width: 800px;">
        <span class="close-btn" onclick="closeLeaseModal()">&times;</span>
        <h2>Lease Agreement</h2>
        <iframe src="${pdfUrl}" style="width:100%; height:400px;"></iframe>
        <div style="margin-top: 1rem;">
          <h3>Sign Here</h3>
          <canvas id="signatureCanvas" width="400" height="150" style="border:1px solid #ccc; border-radius:8px; background:white;"></canvas>
          <br>
          <button class="action-btn" onclick="clearSignature()">Clear</button>
          <button class="action-btn" onclick="saveSignature('${leaseId}')">Sign Lease</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  initSignaturePad();
}

let signaturePad;
function initSignaturePad() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  signaturePad = new SignaturePad(canvas);
}
function clearSignature() {
  if (signaturePad) signaturePad.clear();
}
async function saveSignature(leaseId) {
  if (!signaturePad || signaturePad.isEmpty()) {
    showLeaseModal('Please sign first', 'error');
    return;
  }
  const dataURL = signaturePad.toDataURL();
  const res = await fetch(`/api/leases/sign/${leaseId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + localStorage.getItem('token')
    },
    body: JSON.stringify({ signatureData: dataURL })
  });
  if (res.ok) {
    showLeaseModal('Lease signed successfully!', 'success');
    closeLeaseModal();
  } else {
    showLeaseModal('Failed to sign lease', 'error');
  }
}
function closeLeaseModal() {
  const modal = document.getElementById('leaseModal');
  if (modal) modal.remove();
}