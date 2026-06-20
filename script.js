document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const targetSizeInput = document.getElementById('target-size');
    const targetFormatSelect = document.getElementById('target-format');
    const pngWarning = document.getElementById('png-warning');
    const gallery = document.getElementById('gallery');
    const actionsBar = document.getElementById('actions-bar');
    const summaryText = document.getElementById('summary-text');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');

    // Modal elements
    const imageModal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    const modalCaption = document.getElementById('modal-caption');
    const closeModal = document.querySelector('.close-modal');

    closeModal.addEventListener('click', () => {
        imageModal.classList.add('hidden');
    });

    imageModal.addEventListener('click', (e) => {
        if (e.target === imageModal) {
            imageModal.classList.add('hidden');
        }
    });

    // State
    let processedImages = []; // Array of { blob, filename, originalSize, compressedSize, format }

    // Check Format Selection for PNG Warning
    targetFormatSelect.addEventListener('change', () => {
        if (targetFormatSelect.value === 'image/png') {
            pngWarning.classList.remove('hidden');
        } else {
            pngWarning.classList.add('hidden');
        }
    });

    // Drag & Drop Events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });

    dropzone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFileSelect, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        handleFiles(files);
        // Reset input so the same files can be selected again if cleared
        fileInput.value = '';
    }

    async function handleFiles(files) {
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        const targetSizeKB = parseFloat(targetSizeInput.value) || 200;
        const targetFormat = targetFormatSelect.value;

        actionsBar.classList.remove('hidden');

        for (const file of imageFiles) {
            await processFile(file, targetSizeKB, targetFormat);
        }
    }

    async function processFile(file, targetSizeKB, targetFormat) {
        // Create Card UI
        const cardId = 'card-' + Math.random().toString(36).substr(2, 9);
        const card = document.createElement('div');
        card.className = 'preview-card';
        card.id = cardId;
        card.innerHTML = `
            <div class="loader">
                <div class="spinner"></div>
            </div>
            <div class="card-content" style="display:none;">
                <div class="file-name">${file.name}</div>
                <div class="stats">
                    <!-- Stats injected later -->
                </div>
                <div class="card-actions">
                    <button class="btn btn-primary btn-download">Download</button>
                </div>
            </div>
        `;
        gallery.appendChild(card);

        try {
            const result = await compressImage(file, targetSizeKB, targetFormat);
            
            // Format ext
            const extMap = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp'
            };
            const ext = extMap[result.format] || 'jpg';
            const newFilename = file.name.replace(/\.[^/.]+$/, "") + '-compressed.' + ext;
            result.filename = newFilename;

            processedImages.push(result);
            updateSummary();

            // Update UI
            const loader = card.querySelector('.loader');
            const content = card.querySelector('.card-content');
            const stats = card.querySelector('.stats');
            const downloadBtn = card.querySelector('.btn-download');

            // Image Preview
            const imgUrl = URL.createObjectURL(result.blob);
            const imgPreview = document.createElement('div');
            imgPreview.className = 'image-comparison';
            imgPreview.innerHTML = `
                <img src="${imgUrl}" alt="Preview">
                <span class="image-badge">${ext.toUpperCase()}</span>
            `;
            
            imgPreview.addEventListener('click', () => {
                modalImg.src = imgUrl;
                modalCaption.textContent = result.filename;
                imageModal.classList.remove('hidden');
            });

            card.insertBefore(imgPreview, loader);

            // Calc savings
            const savedBytes = result.originalSize - result.compressedSize;
            const savedPercent = ((savedBytes / result.originalSize) * 100).toFixed(1);
            const isLarger = result.compressedSize > result.originalSize;

            stats.innerHTML = `
                <div>
                    <div class="stat-label">Original</div>
                    <div class="stat-value">${formatBytes(result.originalSize)}</div>
                </div>
                <div>
                    <div class="stat-label">Compressed</div>
                    <div class="stat-value ${isLarger ? 'danger' : 'success'}">${formatBytes(result.compressedSize)}</div>
                </div>
                <div style="grid-column: span 2;">
                    <div class="stat-label">Size Saved</div>
                    <div class="stat-value ${isLarger ? 'danger' : 'success'}">${isLarger ? 'Increased' : savedPercent + '%'}</div>
                </div>
            `;

            downloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = imgUrl;
                a.download = newFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };

            loader.style.display = 'none';
            content.style.display = 'flex';

        } catch (error) {
            console.error("Compression failed for", file.name, error);
            card.innerHTML = `<div style="padding: 1rem; color: var(--warning-text);">Failed to process ${file.name}</div>`;
        }
    }

    function updateSummary() {
        summaryText.textContent = `${processedImages.length} image${processedImages.length !== 1 ? 's' : ''} ready`;
    }

    // --- Compression Logic ---
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    async function compressImage(file, targetSizeKB, targetFormat) {
        const targetSize = targetSizeKB * 1024;
        const img = await loadImage(file);
        let format = targetFormat === 'original' ? file.type : targetFormat;
        
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(format)) {
            format = 'image/jpeg';
        }

        // Corner Case: If file is already smaller than target AND we are keeping the original format.
        // We can just return the original file to prevent any unnecessary quality loss.
        if (file.size <= targetSize && format === file.type) {
            return {
                blob: file,
                originalSize: file.size,
                compressedSize: file.size,
                format: format
            };
        }

        let bestBlob;
        if (format === 'image/png') {
            bestBlob = await compressPNG(img, targetSize);
        } else {
            bestBlob = await compressQualityBased(img, format, targetSize);
        }

        // Corner Case: If the compression somehow made the file larger than the original 
        // AND we didn't change the format, revert to the original to avoid bloating.
        if (bestBlob.size > file.size && format === file.type) {
            return {
                blob: file,
                originalSize: file.size,
                compressedSize: file.size,
                format: format
            };
        }

        return {
            blob: bestBlob,
            originalSize: file.size,
            compressedSize: bestBlob.size,
            format: format
        };
    }

    async function compressQualityBased(img, format, targetSize) {
        let min = 0.0;
        let max = 1.0;
        let bestBlob = null;
        let bestDiff = Infinity;
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Binary search for optimal quality (7 iterations is usually enough)
        for (let i = 0; i < 7; i++) {
            let mid = (min + max) / 2;
            let blob = await new Promise(resolve => canvas.toBlob(resolve, format, mid));
            
            if (!blob) continue;

            let diff = Math.abs(blob.size - targetSize);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestBlob = blob;
            }

            if (blob.size > targetSize) {
                max = mid; // Decrease quality
            } else {
                min = mid; // Increase quality
            }
        }
        
        // Ensure we always return something
        if (!bestBlob) {
            bestBlob = await new Promise(resolve => canvas.toBlob(resolve, format, 0.7));
        }
        return bestBlob;
    }

    async function compressPNG(img, targetSize) {
        let minScale = 0.1;
        let maxScale = 1.0;
        let bestBlob = null;
        let bestDiff = Infinity;

        // Binary search for optimal scale/dimensions
        for (let i = 0; i < 6; i++) {
            let midScale = (minScale + maxScale) / 2;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(img.width * midScale));
            canvas.height = Math.max(1, Math.floor(img.height * midScale));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            
            if (!blob) continue;

            let diff = Math.abs(blob.size - targetSize);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestBlob = blob;
            }

            if (blob.size > targetSize) {
                maxScale = midScale; // Shrink more
            } else {
                minScale = midScale; // Shrink less
            }
        }

        if (!bestBlob) {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            bestBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }
        return bestBlob;
    }

    function formatBytes(bytes, decimals = 1) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    // --- Actions Bar Logic ---
    clearAllBtn.addEventListener('click', () => {
        gallery.innerHTML = '';
        processedImages = [];
        actionsBar.classList.add('hidden');
    });

    downloadAllBtn.addEventListener('click', async () => {
        if (processedImages.length === 0) return;
        
        if (typeof JSZip === 'undefined') {
            alert('JSZip library is not loaded. Cannot create ZIP.');
            return;
        }

        const zip = new JSZip();
        
        processedImages.forEach(img => {
            // JSZip expects Blobs or ArrayBuffers
            zip.file(img.filename, img.blob);
        });

        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = 'Generating ZIP...';

        try {
            const content = await zip.generateAsync({type:"blob"});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = "compressed_images.zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            console.error("ZIP Error", err);
            alert("Failed to generate ZIP.");
        } finally {
            downloadAllBtn.disabled = false;
            downloadAllBtn.textContent = 'Download All (ZIP)';
        }
    });
});
