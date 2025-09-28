// Конфигурация Supabase
const SUPABASE_URL = 'https://fqgcctsvozcoezpfytck.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZ2NjdHN2b3pjb2V6cGZ5dGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNTY0MjQsImV4cCI6MjA3NDYzMjQyNH0.rxutBSydzYJX1fBx-PfaPwtCM_K3gdQ1X20GYNNUwPQ';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class IslandMap {
    constructor() {
        this.plots = [];
        this.canvas = document.getElementById('islandCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentZoom = 1;
        this.showGrid = true;
        this.hoverInfo = document.getElementById('hoverInfo');
        this.currentCoords = document.getElementById('currentCoords');
        this.imageCache = new Map();
        this.colors = {
            unopened: '#CCCCCC',
            opened: '#4A90E2',
            sold: '#50E3C2',
            custom: '#ff6b6b'
        };

        // Параметры для зума
        this.minZoom = 0.3;
        this.maxZoom = 8;
        this.baseCanvasSize = 1000; // Базовый размер для зума 1x

        // Touch/Pinch параметры
        this.touches = [];
        this.lastPinchDistance = 0;
        this.isPinching = false;
        this.pinchCenter = { x: 0, y: 0 };

        // Параметры для перемещения карты
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartScrollLeft = 0;
        this.dragStartScrollTop = 0;
        this.lastTouchTime = 0;
        this.touchStartTime = 0;
        this.hasMoved = false;

        // Параметры тап-перемещения
        this.isMovingToTarget = false;
        this.moveAnimationId = null;

        // Контейнер для скролла
        this.container = this.canvas.parentElement;

        // Размеры участков
        this.baseCellSize = 10; // Базовый размер клетки для зума 1x
        
        this.setupCanvas();
        this.init();
    }

    setupCanvas() {
        // Устанавливаем начальный размер канваса
        this.updateCanvasSize();
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.mozImageSmoothingEnabled = false;
    }

    // НОВЫЙ метод: обновляем реальный размер канваса вместо CSS transform
    updateCanvasSize() {
        const newSize = Math.round(this.baseCanvasSize * this.currentZoom);
        
        // Устанавливаем реальный размер канваса
        this.canvas.width = newSize;
        this.canvas.height = newSize;
        
        // Устанавливаем CSS размер (всегда равен реальному размеру)
        this.canvas.style.width = newSize + 'px';
        this.canvas.style.height = newSize + 'px';
        
        // Убираем CSS transform полностью
        this.canvas.style.transform = 'none';
        
        // Обновляем размер ячеек
        this.currentCellSize = Math.max(1, this.baseCellSize * this.currentZoom);
    }

    async init() {
        await this.loadPlots();
        this.setupEventListeners();
        this.render();
        console.log('✅ Карта готова!');
    }

    async loadPlots() {
        console.log('📡 Загрузка данных из Supabase...');
        try {
            const { data, error } = await supabase
                .from('plots')
                .select('id, coord_x, coord_y, status, price, owner_name, image_url')
                .limit(10000);

            if (error) throw error;
            this.plots = data || [];

            if (this.plots.length < 10000) {
                this.generateMissingPlots();
            }

            console.log(`✅ Загружено ${this.plots.length} участков`);
            const plotsWithImages = this.plots.filter(plot => plot.image_url && plot.image_url.trim() !== '');
            console.log(`🖼️ В базе найдено ${plotsWithImages.length} участков с картинками`);
            
            if (plotsWithImages.length === 0) {
                console.log('🎨 Добавляем тестовые картинки...');
                this.addTestImagesToPlots();
            } else {
                this.preloadImages();
            }

        } catch (error) {
            console.warn('⚠️ Создаем данные локально:', error);
            this.generateAllPlotsLocally();
        }
    }

    async preloadImages() {
        const imageUrls = this.plots
            .filter(plot => plot.image_url && plot.image_url.trim() !== '')
            .map(plot => plot.image_url)
            .filter((url, index, self) => self.indexOf(url) === index);
        
        console.log(`🖼️ Загружаем ${imageUrls.length} уникальных картинок`);
        const loadPromises = imageUrls.map(url => this.loadImageToCache(url));
        await Promise.allSettled(loadPromises);
        console.log('✅ Все картинки обработаны');
        this.render();
    }

    async loadImageToCache(url) {
        return new Promise((resolve) => {
            if (!url || url.trim() === '') {
                resolve(null);
                return;
            }

            if (this.imageCache.has(url)) {
                resolve(this.imageCache.get(url));
                return;
            }

            console.log(`📥 Загружаем: ${url}`);
            const img = new Image();
            img.crossOrigin = "anonymous";
            
            img.onload = () => {
                console.log(`✅ Загружена: ${url} (${img.width}x${img.height})`);
                this.imageCache.set(url, img);
                resolve(img);
            };
            
            img.onerror = () => {
                console.warn(`❌ Ошибка: ${url}`);
                const stub = this.createImageStub();
                this.imageCache.set(url, stub);
                resolve(stub);
            };
            
            img.src = url;
        });
    }

    createImageStub() {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(0, 0, 100, 100);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('IMG', 50, 50);
        
        const img = new Image();
        img.src = canvas.toDataURL();
        return img;
    }

    addTestImagesToPlots() {
        const testImages = [
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop',
            'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=400&h=400&fit=crop',
            'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=400&fit=crop',
            'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=400&fit=crop',
            'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=400&fit=crop',
            'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&h=400&fit=crop'
        ];

        console.log('🎨 Распределяем тестовые картинки по всей карте...');
        const imagesPerRow = 10;
        const imagesPerCol = 10;
        const stepX = Math.floor(100 / imagesPerRow);
        const stepY = Math.floor(100 / imagesPerCol);
        let imageIndex = 0;

        for (let gridX = 0; gridX < imagesPerRow; gridX++) {
            for (let gridY = 0; gridY < imagesPerCol; gridY++) {
                const x = gridX * stepX + Math.floor(Math.random() * stepX);
                const y = gridY * stepY + Math.floor(Math.random() * stepY);
                const plotIndex = y * 100 + x;

                if (plotIndex < this.plots.length) {
                    const randomImage = testImages[imageIndex % testImages.length];
                    this.plots[plotIndex].image_url = randomImage;
                    this.plots[plotIndex].status = 'custom';
                    imageIndex++;
                }
            }
        }

        console.log(`✅ Добавлено ${imageIndex} тестовых картинок равномерно по карте`);
        this.preloadImages();
    }

    generateAllPlotsLocally() {
        this.plots = [];
        for (let x = 0; x < 100; x++) {
            for (let y = 0; y < 100; y++) {
                const status = Math.random() < 0.8 ? 'unopened' : 
                             Math.random() < 0.95 ? 'opened' : 'sold';
                
                this.plots.push({
                    id: x * 100 + y + 1,
                    coord_x: x,
                    coord_y: y,
                    status: status,
                    price: Math.round(100 + Math.random() * 400),
                    owner_name: status === 'sold' ? 'Игрок' : null,
                    image_url: null
                });
            }
        }
        this.addTestImagesToPlots();
    }

    setupEventListeners() {
        // Колесико мыши для плавного зума
        this.canvas.addEventListener('wheel', (e) => this.handleWheelZoom(e), { passive: false });
        
        // Touch события для мобильных устройств
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

        // Mouse события для десктопа
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

        // Клики по участкам
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Остальные события
        document.getElementById('showGrid').addEventListener('click', () => this.toggleGrid());

        // Модальное окно
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('buyPlot').addEventListener('click', () => this.buyPlot());
        document.getElementById('setImage').addEventListener('click', () => this.setCustomImage());
    }

    // ИСПРАВЛЕННЫЙ зум колесиком мыши
    handleWheelZoom(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.currentZoom * zoomFactor));
        
        this.setZoomCorrectly(newZoom, mouseX, mouseY);
    }

    // ПОЛНОСТЬЮ НОВЫЙ метод зума с правильной математикой
    setZoomCorrectly(newZoom, focusX, focusY) {
        // Сохраняем текущие позиции
        const oldZoom = this.currentZoom;
        const oldScrollLeft = this.container.scrollLeft;
        const oldScrollTop = this.container.scrollTop;
        
        // Вычисляем позицию фокуса в координатах карты до зума
        const mapX = (focusX + oldScrollLeft) / oldZoom;
        const mapY = (focusY + oldScrollTop) / oldZoom;
        
        // Устанавливаем новый зум
        this.currentZoom = newZoom;
        this.updateCanvasSize();
        this.render();
        
        // Вычисляем новую позицию скролла чтобы фокус остался на месте
        const newScrollLeft = mapX * newZoom - focusX;
        const newScrollTop = mapY * newZoom - focusY;
        
        // Применяем новый скролл
        this.container.scrollLeft = Math.max(0, newScrollLeft);
        this.container.scrollTop = Math.max(0, newScrollTop);
        
        // Обновляем индикатор зума
        document.getElementById('zoomLevel').textContent = `${Math.round(this.currentZoom * 100)}%`;
    }

    // Touch события - ИСПРАВЛЕНО с новой математикой зума
    handleTouchStart(e) {
        e.preventDefault();
        this.touches = Array.from(e.touches);
        this.touchStartTime = Date.now();
        this.hasMoved = false;
        
        if (this.isMovingToTarget) {
            cancelAnimationFrame(this.moveAnimationId);
            this.isMovingToTarget = false;
        }
        
        if (this.touches.length === 1) {
            this.isDragging = true;
            this.dragStartX = this.touches[0].clientX;
            this.dragStartY = this.touches[0].clientY;
            this.dragStartScrollLeft = this.container.scrollLeft;
            this.dragStartScrollTop = this.container.scrollTop;
        } else if (this.touches.length === 2) {
            this.isPinching = true;
            this.isDragging = false;
            this.lastPinchDistance = this.getPinchDistance();
            
            // Фиксируем центр pinch в координатах канваса
            const rect = this.canvas.getBoundingClientRect();
            this.pinchCenter = {
                x: (this.touches[0].clientX + this.touches[1].clientX) / 2 - rect.left,
                y: (this.touches[0].clientY + this.touches[1].clientY) / 2 - rect.top
            };
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        this.touches = Array.from(e.touches);
        this.hasMoved = true;
        
        if (this.isPinching && this.touches.length === 2) {
            const currentDistance = this.getPinchDistance();
            const scale = currentDistance / this.lastPinchDistance;
            
            if (Math.abs(scale - 1) > 0.01) {
                const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.currentZoom * scale));
                
                // Используем фиксированный центр pinch
                this.setZoomCorrectly(newZoom, this.pinchCenter.x, this.pinchCenter.y);
                
                this.lastPinchDistance = currentDistance;
            }
        } else if (this.isDragging && this.touches.length === 1) {
            const deltaX = this.touches[0].clientX - this.dragStartX;
            const deltaY = this.touches[0].clientY - this.dragStartY;
            
            this.container.scrollLeft = this.dragStartScrollLeft - deltaX;
            this.container.scrollTop = this.dragStartScrollTop - deltaY;
        }
    }

    handleTouchEnd(e) {
        const touchDuration = Date.now() - this.touchStartTime;
        const remainingTouches = Array.from(e.touches);
        
        if (remainingTouches.length < 2) {
            this.isPinching = false;
            this.lastPinchDistance = 0;
        }
        
        if (remainingTouches.length === 0) {
            if (touchDuration < 300 && !this.hasMoved) {
                const touch = e.changedTouches[0];
                this.handleTapNavigation(touch);
            }
            
            this.isDragging = false;
            this.hasMoved = false;
        }
        
        this.touches = remainingTouches;
    }

    handleTapNavigation(touch) {
        const now = Date.now();
        const timeSinceLastTap = now - this.lastTouchTime;
        
        if (timeSinceLastTap < 300) {
            // Двойной тап - перемещаемся к точке
            const rect = this.canvas.getBoundingClientRect();
            const tapX = touch.clientX - rect.left;
            const tapY = touch.clientY - rect.top;
            
            this.smoothMoveToPoint(tapX, tapY);
        } else {
            // Одиночный тап - проверяем клик по участку
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            setTimeout(() => {
                if (Date.now() - this.lastTouchTime > 250) {
                    this.processClick(x, y);
                }
            }, 250);
        }
        
        this.lastTouchTime = now;
    }

    smoothMoveToPoint(targetX, targetY) {
        const containerRect = this.container.getBoundingClientRect();
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;
        
        const currentScrollLeft = this.container.scrollLeft;
        const currentScrollTop = this.container.scrollTop;
        
        const targetScrollLeft = currentScrollLeft + (targetX - centerX);
        const targetScrollTop = currentScrollTop + (targetY - centerY);
        
        const maxScrollLeft = this.canvas.offsetWidth - this.container.clientWidth;
        const maxScrollTop = this.canvas.offsetHeight - this.container.clientHeight;
        
        const finalScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetScrollLeft));
        const finalScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));
        
        this.animateMoveTo(currentScrollLeft, currentScrollTop, finalScrollLeft, finalScrollTop);
    }

    animateMoveTo(startLeft, startTop, endLeft, endTop) {
        if (this.isMovingToTarget) {
            cancelAnimationFrame(this.moveAnimationId);
        }
        
        this.isMovingToTarget = true;
        const startTime = Date.now();
        const duration = 500;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            const currentLeft = startLeft + (endLeft - startLeft) * easeProgress;
            const currentTop = startTop + (endTop - startTop) * easeProgress;
            
            this.container.scrollLeft = currentLeft;
            this.container.scrollTop = currentTop;
            
            if (progress < 1) {
                this.moveAnimationId = requestAnimationFrame(animate);
            } else {
                this.isMovingToTarget = false;
            }
        };
        
        animate();
    }

    getPinchDistance() {
        if (this.touches.length < 2) return 0;
        
        const dx = this.touches[0].clientX - this.touches[1].clientX;
        const dy = this.touches[0].clientY - this.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Mouse события для десктопа
    handleMouseDown(e) {
        if (e.button === 0) {
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.dragStartScrollLeft = this.container.scrollLeft;
            this.dragStartScrollTop = this.container.scrollTop;
            this.canvas.style.cursor = 'grabbing';
            this.hasMoved = false;
        }
    }

    handleMouseMove(e) {
        if (this.isDragging) {
            const deltaX = e.clientX - this.dragStartX;
            const deltaY = e.clientY - this.dragStartY;
            
            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                this.hasMoved = true;
            }
            
            this.container.scrollLeft = this.dragStartScrollLeft - deltaX;
            this.container.scrollTop = this.dragStartScrollTop - deltaY;
        } else {
            this.updateHoverInfo(e);
        }
    }

    handleMouseUp(e) {
        if (this.isDragging) {
            if (!this.hasMoved) {
                const rect = this.canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                
                const now = Date.now();
                const timeSinceLastClick = now - (this.lastClickTime || 0);
                
                if (timeSinceLastClick < 300) {
                    this.smoothMoveToPoint(clickX, clickY);
                }
                
                this.lastClickTime = now;
            }
            
            this.isDragging = false;
            this.hasMoved = false;
            this.canvas.style.cursor = 'grab';
        }
    }

    handleMouseLeave() {
        this.isDragging = false;
        this.hasMoved = false;
        this.canvas.style.cursor = 'grab';
        this.hideHoverInfo();
    }

    updateHoverInfo(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const coords = this.getPlotCoordinates(x, y);
        if (coords) {
            this.currentCoords.textContent = `X:${coords.x}, Y:${coords.y}`;
            const plot = this.findPlotByCoords(coords.x, coords.y);
            if (plot) {
                this.showHoverInfo(e.clientX, e.clientY, plot);
            }
        } else {
            this.hideHoverInfo();
        }
    }

    handleCanvasClick(e) {
        if (this.isDragging || this.hasMoved || this.isMovingToTarget) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.processClick(x, y);
    }

    processClick(x, y) {
        const coords = this.getPlotCoordinates(x, y);
        if (coords && coords.x >= 0 && coords.x < 100 && coords.y >= 0 && coords.y < 100) {
            const plot = this.findPlotByCoords(coords.x, coords.y);
            if (plot) {
                this.showPlotDetails(plot);
            }
        }
    }

    getPlotCoordinates(canvasX, canvasY) {
        const scrollLeft = this.container.scrollLeft;
        const scrollTop = this.container.scrollTop;
        
        // Простая математика без CSS transform
        const x = Math.floor((canvasX + scrollLeft) / this.currentCellSize);
        const y = Math.floor((canvasY + scrollTop) / this.currentCellSize);

        return { x, y };
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.imageSmoothingEnabled = false;
        
        this.plots.forEach(plot => {
            this.renderPlot(plot);
        });
        
        if (this.showGrid) {
            this.renderGrid();
        }
    }

    renderPlot(plot) {
        const x = plot.coord_x * this.currentCellSize;
        const y = plot.coord_y * this.currentCellSize;
        const size = this.currentCellSize;

        const hasImage = plot.image_url && plot.image_url.trim() !== '';
        const imageLoaded = hasImage && this.imageCache.has(plot.image_url);

        if (imageLoaded && size > 5) {
            const img = this.imageCache.get(plot.image_url);
            this.ctx.drawImage(img, x, y, size, size);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x, y, size, size);
        } else {
            this.ctx.fillStyle = this.colors[plot.status] || this.colors.unopened;
            this.ctx.fillRect(x, y, size, size);
            
            if (hasImage && size > 10) {
                this.renderCameraIcon(x, y, size);
            }
        }
    }

    renderCameraIcon(x, y, size) {
        const iconSize = Math.max(4, size / 5);
        this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this.ctx.fillRect(x + size - iconSize - 2, y + 2, iconSize, iconSize - 2);
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.ctx.beginPath();
        this.ctx.arc(x + size - iconSize/2 - 2, y + 2 + iconSize/2, iconSize/4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = 'gold';
        this.ctx.fillRect(x + size - iconSize + 1, y + 1, 2, 1);
    }

    renderGrid() {
        this.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        this.ctx.lineWidth = 0.5;

        for (let i = 0; i <= 100; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.currentCellSize, 0);
            this.ctx.lineTo(i * this.currentCellSize, this.canvas.height);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.currentCellSize);
            this.ctx.lineTo(this.canvas.width, i * this.currentCellSize);
            this.ctx.stroke();
        }
    }

    showHoverInfo(x, y, plot) {
        this.hoverInfo.style.left = (x + 15) + 'px';
        this.hoverInfo.style.top = (y + 15) + 'px';
        this.hoverInfo.classList.add('show');
        
        const statusText = this.getStatusText(plot.status);
        const hasImage = plot.image_url ? '✓ Есть картинка' : '✗ Без картинки';
        
        this.hoverInfo.innerHTML = `
            <strong>Участок ${plot.id}</strong><br>
            Статус: ${statusText}<br>
            Цена: ${plot.price} монет<br>
            ${hasImage}
        `;
    }

    hideHoverInfo() {
        this.hoverInfo.classList.remove('show');
    }

    findPlotByCoords(x, y) {
        return this.plots.find(plot => plot.coord_x === x && plot.coord_y === y);
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
        const btn = document.getElementById('showGrid');
        btn.textContent = this.showGrid ? '📋 Сетка' : '⬜ Без сетки';
        btn.classList.toggle('active', !this.showGrid);
        this.render();
    }

    showPlotDetails(plot) {
        document.getElementById('plotId').textContent = plot.id;
        document.getElementById('plotX').textContent = plot.coord_x;
        document.getElementById('plotY').textContent = plot.coord_y;
        document.getElementById('plotPrice').textContent = plot.price;
        document.getElementById('plotOwner').textContent = plot.owner_name || 'Не назначен';
        
        const statusElement = document.getElementById('plotStatus');
        statusElement.textContent = this.getStatusText(plot.status);
        statusElement.dataset.status = plot.status;
        
        const imageContainer = document.getElementById('plotImageContainer');
        if (plot.image_url) {
            imageContainer.innerHTML = `<img src="${plot.image_url}" alt="Участок ${plot.id}" style="max-width: 100%; border-radius: 8px;">`;
        } else {
            imageContainer.innerHTML = '<p style="color: #666; font-style: italic;">Кастомная картинка не установлена</p>';
        }
        
        const buyButton = document.getElementById('buyPlot');
        if (plot.status === 'sold') {
            buyButton.textContent = 'Уже продано';
            buyButton.disabled = true;
        } else {
            buyButton.textContent = `Купить за ${plot.price} монет`;
            buyButton.disabled = false;
        }
        
        this.currentPlot = plot;
        document.getElementById('plotModal').style.display = 'block';
    }

    getStatusText(status) {
        const statusMap = {
            'unopened': 'Неоткрыто',
            'opened': 'Открыто',
            'sold': 'Продано',
            'custom': 'Кастом'
        };
        return statusMap[status] || status;
    }

    closeModal() {
        document.getElementById('plotModal').style.display = 'none';
        this.currentPlot = null;
    }

    async buyPlot() {
        if (!this.currentPlot) return;

        try {
            this.currentPlot.status = 'sold';
            this.currentPlot.owner_name = 'Игрок';
            this.render();
            this.closeModal();

            const { error } = await supabase
                .from('plots')
                .update({
                    status: 'sold',
                    owner_name: 'Игрок',
                    purchase_date: new Date().toISOString().split('T')[0]
                })
                .eq('id', this.currentPlot.id);

            if (!error) {
                alert(`🎉 Участок ${this.currentPlot.id} куплен!`);
            }
        } catch (error) {
            console.error('Ошибка покупки:', error);
        }
    }

    async setCustomImage() {
        if (!this.currentPlot) return;

        const imageUrl = prompt('Введите URL картинки (рекомендуется 400x400px или больше):', 
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop');

        if (imageUrl) {
            try {
                await this.loadImageToCache(imageUrl);
                this.currentPlot.image_url = imageUrl;
                this.currentPlot.status = 'custom';
                this.render();
                this.closeModal();
                alert('🎨 Картинка установлена!');
            } catch (error) {
                alert('❌ Ошибка загрузки картинки. Проверьте URL.');
            }
        }
    }
}

// Запуск приложения
window.addEventListener('DOMContentLoaded', () => {
    console.log('🌴 Запускаем карту острова...');
    window.islandMap = new IslandMap();
});
