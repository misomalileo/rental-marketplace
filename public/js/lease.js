// ======================================
// Digital Lease Agreements
// ======================================
async function generateLease(bookingId) {
  const res = await fetch(`/api/leases/generate/${bookingId}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
  });
  const data = await res.json();
  if (res.ok) {
    openLeaseModal(data.leaseId, data.pdfUrl);
  } else {
    alert('Failed to generate lease');
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
    alert('Please sign first');
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
    alert('Lease signed successfully!');
    closeLeaseModal();
  } else {
    alert('Failed to sign lease');
  }
}
function closeLeaseModal() {
  const modal = document.getElementById('leaseModal');
  if (modal) modal.remove();
}