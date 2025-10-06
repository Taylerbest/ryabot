// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
let telegramUser = null;

if (tg) {
    console.log('🤖 Telegram WebApp инициализирован');
    tg.ready();
    tg.expand();
    
    const initData = tg.initDataUnsafe;
    if (initData?.user) {
        telegramUser = initData.user;
        console.log('👤 Пользователь Telegram:', telegramUser);
    }
    
    if (tg.colorScheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
    
    tg.setHeaderColor('#2c3e50');
    tg.BackButton.hide();
} else {
    console.log('⚠️ Telegram WebApp не обнаружен (работаем в браузере)');
}

// Конфигурация Supabase для Ryabot Island
const SUPABASE_URL = 'https://fqgcctsvozcoezpfytck.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZ2NjdHN2b3pjb2V6cGZ5dGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNTY0MjQsImV4cCI6MjA3NDYzMjQyNH0.rxutBSydzYJX1fBx-PfaPwtCM_K3gdQ1X20GYNNUwPQ';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class RyabotIslandMap {
    constructor() {
        this.landplots = [];
        this.canvas = document.getElementById('islandCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentZoom = 1;
        this.showGrid = true;
        this.hoverInfo = document.getElementById('hoverInfo');
        this.currentCoords = document.getElementById('currentCoords');
        
        // Цвета статусов по MVP Ryabot Island
        this.statusColors = {
            'undiscovered': '#95A5A6',   // Серый - неоткрытые
            'available': '#2ECC71',      // Зеленый - доступные для покупки
            'owned': '#3498DB',          // Синий - в собственности
            'forsale': '#E67E22',        // Оранжевый - продается игроками
            'anomaly': '#9B59B6'         // Фиолетовый - аномальные зоны
        };

        // Цвета зон острова
        this.zoneColors = {
            'plains': '#F4D03F',     // Желтоватый - равнины
            'forest': '#58D68D',     // Зеленый - лес
            'mountains': '#85929E',  // Серый - горы
            'coast': '#5DADE2',      // Голубой - побережье
            'anomaly': '#AF7AC5'     // Фиолетовый - аномалии
        };

        // Параметры для зума
        this.minZoom = 0.3;
        this.maxZoom = 8;
        this.baseCanvasSize = 1000;

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

        // Размеры участков (100x100 grid)
        this.baseCellSize = 10;

        // События для ленты новостей
        this.events = [];
        this.eventUpdateInterval = null;

        // Фильтры
        this.activeFilters = {
            status: 'all',
            zone: 'all',
            price: 'all'
        };

        // Бонусы зон по GDD
        this.zoneBonuses = {
            plains: { type: 'crops', value: 15, description: '+15% к урожаю культур' },
            forest: { type: 'wood', value: 20, description: '+20% к добыче дерева' },
            mountains: { type: 'mining', value: 25, description: '+25% к добыче ресурсов' },
            coast: { type: 'fishing', value: 18, description: '+18% к рыбной ловле' },
            anomaly: { type: 'rbtc', value: 50, description: '+50% к находкам RBTC' }
        };
        
        this.setupCanvas();
        this.init();
    }

    setupCanvas() {
        this.updateCanvasSize();
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.mozImageSmoothingEnabled = false;
    }

    updateCanvasSize() {
        const newSize = Math.round(this.baseCanvasSize * this.currentZoom);
        
        this.canvas.width = newSize;
        this.canvas.height = newSize;
        
        this.canvas.style.width = newSize + 'px';
        this.canvas.style.height = newSize + 'px';
        
        this.canvas.style.transform = 'none';
        
        this.currentCellSize = Math.max(1, this.baseCellSize * this.currentZoom);
    }

    async init() {
        await this.loadLandPlots();
        this.setupEventListeners();
        this.startEventUpdates();
        this.render();
        this.updateIslandStats();
        console.log('✅ Карта Ryabot Island готова!');
    }

    async loadLandPlots() {
        console.log('📡 Загрузка участков из Supabase...');
        try {
            // Пытаемся загрузить из таблицы landplots
            const { data, error } = await supabase
                .from('landplots')
                .select(`
                    plotid, ownerid, zonetype, zonebonus, 
                    pricerbtc, priceryabaks, status, 
                    discoveredby, discoveredat, purchasedat, coordinates
                `)
                .limit(10000);

            if (error) throw error;
            this.landplots = data || [];

            if (this.landplots.length < 10000) {
                console.log('🏗️ Генерируем недостающие участки...');
                this.generateMissingPlots();
            }

            console.log(`✅ Загружено ${this.landplots.length} участков острова`);

        } catch (error) {
            console.warn('⚠️ Создаем MVP данные локально:', error);
            this.generateAllPlotsLocally();
        }
    }

    generateAllPlotsLocally() {
        console.log('🏝️ Генерируем остров Ryabot Island MVP...');
        this.landplots = [];
        
        for (let x = 0; x < 100; x++) {
            for (let y = 0; y < 100; y++) {
                const plotid = y * 100 + x + 1;
                
                // Случайное распределение статусов по MVP логике
                let status = 'undiscovered';
                const rand = Math.random();
                
                // 60% неоткрытые, 25% доступные, 10% в собственности, 5% на продаже
                if (rand > 0.6) status = 'available';
                if (rand > 0.85) status = 'owned';
                if (rand > 0.95) status = 'forsale';

                // Определяем зону по позиции на карте
                let zonetype = this.determineZoneByPosition(x, y);
                
                // Цены по MVP экономике (100-2000 RBTC)
                const basePrice = 100;
                const zoneMultiplier = {
                    'plains': 1.0,
                    'forest': 1.2,
                    'coast': 1.5,
                    'mountains': 1.8,
                    'anomaly': 3.0
                }[zonetype];
                
                const priceRBTC = Math.round(basePrice * zoneMultiplier * (0.5 + Math.random()));
                const priceRyabaks = priceRBTC * 60; // Курс 1 RBTC = 60 рябаков

                this.landplots.push({
                    plotid: plotid,
                    ownerid: status === 'owned' ? Math.floor(Math.random() * 1000000) : null,
                    zonetype: zonetype,
                    zonebonus: this.zoneBonuses[zonetype],
                    pricerbtc: priceRBTC,
                    priceryabaks: priceRyabaks,
                    status: status,
                    discoveredby: status !== 'undiscovered' ? Math.floor(Math.random() * 1000000) : null,
                    discoveredat: status !== 'undiscovered' ? this.generateRandomDate() : null,
                    purchasedat: status === 'owned' ? this.generateRandomDate() : null,
                    coordinates: { x: x, y: y }
                });
            }
        }

        console.log('🎲 MVP остров Ryabot Island создан!');
    }

    determineZoneByPosition(x, y) {
        // Логика определения зон по позиции (как в настоящих островах)
        const centerX = 50, centerY = 50;
        const distanceFromCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        
        // Побережье - края карты
        if (x < 5 || x > 94 || y < 5 || y > 94) {
            return 'coast';
        }
        
        // Аномалии - случайные редкие зоны (2%)
        if (Math.random() < 0.02) {
            return 'anomaly';
        }
        
        // Горы - центральная часть острова
        if (distanceFromCenter < 15) {
            return 'mountains';
        }
        
        // Лес - кольцо вокруг гор
        if (distanceFromCenter < 30) {
            return 'forest';
        }
        
        // Равнины - остальная территория
        return 'plains';
    }

    generateRandomDate() {
        const start = new Date('2025-09-01');
        const end = new Date();
        return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }

    startEventUpdates() {
        this.generateRyabotEvents();
        this.updateEventsFeed();
        
        // Обновляем события каждые 15 секунд
        this.eventUpdateInterval = setInterval(() => {
            if (Math.random() > 0.6) { // 40% шанс нового события
                this.generateRyabotEvents();
                this.updateEventsFeed();
            }
        }, 15000);
    }

    generateRyabotEvents() {
        const eventTemplates = [
            { type: 'discovery', text: '🗺️ Игрок{id} открыл новый участок в зоне {zone}' },
            { type: 'purchase', text: '💰 Участок #{plot} куплен за {price} RBTC' },
            { type: 'sale', text: '🏪 Участок #{plot} выставлен на продажу за {price} RBTC' },
            { type: 'anomaly', text: '⚡ Найдена аномалия! Участок #{plot} дает особые бонусы' },
            { type: 'expedition', text: '🚀 Экспедиция обнаружила {count} новых участков' },
            { type: 'milestone', text: '🎉 {percent}% острова уже исследовано игроками!' }
        ];
        
        const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
        const randomPlot = this.landplots[Math.floor(Math.random() * this.landplots.length)];
        
        let eventText = template.text
            .replace('{id}', Math.floor(Math.random() * 1000))
            .replace('{plot}', randomPlot.plotid)
            .replace('{price}', randomPlot.pricerbtc)
            .replace('{zone}', this.getZoneDisplayName(randomPlot.zonetype))
            .replace('{count}', Math.floor(Math.random() * 10) + 1)
            .replace('{percent}', (25 + Math.random() * 50).toFixed(1));
            
        this.events.unshift({
            id: Date.now(),
            text: eventText,
            timestamp: new Date()
        });
        
        // Оставляем только последние 5 событий
        this.events = this.events.slice(0, 5);
    }

    getZoneDisplayName(zonetype) {
        const zoneNames = {
            'plains': 'Равнины',
            'forest': 'Лес', 
            'mountains': 'Горы',
            'coast': 'Побережье',
            'anomaly': 'Аномальная зона'
        };
        return zoneNames[zonetype] || zonetype;
    }

    updateEventsFeed() {
        const feed = document.getElementById('eventsFeed');
        if (!feed) return;
        
        feed.innerHTML = this.events
            .map(event => `<span class="event-item">${event.text}</span>`)
            .join('');
    }

    updateIslandStats() {
        const totalPlots = this.landplots.length;
        const discoveredPlots = this.landplots.filter(p => p.status !== 'undiscovered').length;
        const ownedPlots = this.landplots.filter(p => p.status === 'owned').length;
        const forSalePlots = this.landplots.filter(p => p.status === 'forsale').length;
        
        // Подсчет общей стоимости RBTC на рынке
        const totalRBTC = this.landplots
            .filter(p => p.status === 'available' || p.status === 'forsale')
            .reduce((sum, p) => sum + (p.pricerbtc || 0), 0);

        const discoveredPercent = ((discoveredPlots / totalPlots) * 100).toFixed(1);
        const ownedPercent = ((ownedPlots / totalPlots) * 100).toFixed(1);
        const salePercent = ((forSalePlots / totalPlots) * 100).toFixed(1);

        document.getElementById('discoveredPlots').textContent = discoveredPlots.toLocaleString();
        document.getElementById('discoveredPercent').textContent = discoveredPercent + '%';
        document.getElementById('ownedPlots').textContent = ownedPlots.toLocaleString();
        document.getElementById('ownedPercent').textContent = ownedPercent + '%';
        document.getElementById('forSalePlots').textContent = forSalePlots.toLocaleString();
        document.getElementById('salePercent').textContent = salePercent + '%';
        document.getElementById('totalValue').textContent = totalRBTC.toLocaleString();
    }

    setupEventListeners() {
        // Зум и навигация
        this.canvas.addEventListener('wheel', (e) => this.handleWheelZoom(e), { passive: false });
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Фильтры
        document.getElementById('filterStatus').addEventListener('change', (e) => {
            this.activeFilters.status = e.target.value;
            this.render();
        });
        
        document.getElementById('filterZone').addEventListener('change', (e) => {
            this.activeFilters.zone = e.target.value;
            this.render();
        });

        document.getElementById('filterPrice').addEventListener('change', (e) => {
            this.activeFilters.price = e.target.value;
            this.render();
        });

        // Управление
        document.getElementById('showGrid').addEventListener('click', () => this.toggleGrid());
        document.getElementById('resetView').addEventListener('click', () => this.resetView());

        // Модальное окно
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        
        // Интеграция с игрой
        document.getElementById('openInGame').addEventListener('click', () => this.openInGame());
        document.getElementById('viewInBot').addEventListener('click', () => this.openInBot());
    }

    // Зум колесиком мыши
    handleWheelZoom(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.currentZoom * zoomFactor));
        
        this.setZoomCorrectly(newZoom, mouseX, mouseY);
    }

    setZoomCorrectly(newZoom, focusX, focusY) {
        const oldZoom = this.currentZoom;
        const oldScrollLeft = this.container.scrollLeft;
        const oldScrollTop = this.container.scrollTop;
        
        const mapX = (focusX + oldScrollLeft) / oldZoom;
        const mapY = (focusY + oldScrollTop) / oldZoom;
        
        this.currentZoom = newZoom;
        this.updateCanvasSize();
        this.render();
        
        const newScrollLeft = mapX * newZoom - focusX;
        const newScrollTop = mapY * newZoom - focusY;
        
        this.container.scrollLeft = Math.max(0, newScrollLeft);
        this.container.scrollTop = Math.max(0, newScrollTop);
        
        document.getElementById('zoomLevel').textContent = `${Math.round(this.currentZoom * 100)}%`;
    }

    // Touch события (аналогично предыдущей версии)
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
            const rect = this.canvas.getBoundingClientRect();
            const tapX = touch.clientX - rect.left;
            const tapY = touch.clientY - rect.top;
            
            this.smoothMoveToPoint(tapX, tapY);
        } else {
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
        
        const x = Math.floor((canvasX + scrollLeft) / this.currentCellSize);
        const y = Math.floor((canvasY + scrollTop) / this.currentCellSize);

        return { x, y };
    }

    shouldRenderPlot(plot) {
        // Применяем фильтры
        if (this.activeFilters.status !== 'all' && plot.status !== this.activeFilters.status) {
            return false;
        }
        
        if (this.activeFilters.zone !== 'all' && plot.zonetype !== this.activeFilters.zone) {
            return false;
        }

        if (this.activeFilters.price !== 'all') {
            const price = plot.pricerbtc || 0;
            switch (this.activeFilters.price) {
                case 'cheap':
                    if (price >= 50) return false;
                    break;
                case 'medium':
                    if (price < 50 || price >= 200) return false;
                    break;
                case 'expensive':
                    if (price < 200) return false;
                    break;
            }
        }
        
        return true;
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.imageSmoothingEnabled = false;
        
        this.landplots.forEach(plot => {
            if (this.shouldRenderPlot(plot)) {
                this.renderPlot(plot);
            }
        });
        
        if (this.showGrid) {
            this.renderGrid();
        }
    }

    renderPlot(plot) {
        const x = plot.coordinates.x * this.currentCellSize;
        const y = plot.coordinates.y * this.currentCellSize;
        const size = this.currentCellSize;

        // Определяем цвет по статусу или зоне
        let color;
        if (plot.status === 'anomaly' || plot.zonetype === 'anomaly') {
            color = this.zoneColors.anomaly;
        } else {
            color = this.statusColors[plot.status] || this.statusColors.undiscovered;
        }

        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, size, size);

        // Добавляем индикаторы для больших участков
        if (size > 15) {
            // Показываем цену для доступных участков
            if (plot.status === 'available' || plot.status === 'forsale') {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                this.ctx.font = `${Math.min(size / 4, 10)}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(plot.pricerbtc + 'R', x + size/2, y + size/2 + 3);
            }

            // Рамка для участков в собственности
            if (plot.status === 'owned') {
                this.ctx.strokeStyle = '#2C3E50';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x, y, size, size);
            }

            // Специальная отметка для аномалий
            if (plot.zonetype === 'anomaly') {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                this.ctx.font = `${Math.min(size / 3, 12)}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText('⚡', x + size/2, y + size/2 + 4);
            }
        }
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
        const zoneText = this.getZoneDisplayName(plot.zonetype);
        const bonusText = plot.zonebonus ? plot.zonebonus.description : 'Нет бонуса';
        
        this.hoverInfo.innerHTML = `
            <strong>Участок ${plot.plotid}</strong><br>
            <span class="status-${plot.status}">● ${statusText}</span><br>
            🌍 ${zoneText}<br>
            💎 ${bonusText}<br>
            💰 ${plot.pricerbtc} RBTC (${plot.priceryabaks.toLocaleString()} рябаков)
        `;
    }

    hideHoverInfo() {
        this.hoverInfo.classList.remove('show');
    }

    findPlotByCoords(x, y) {
        return this.landplots.find(plot => plot.coordinates.x === x && plot.coordinates.y === y);
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
        const btn = document.getElementById('showGrid');
        btn.textContent = this.showGrid ? '📋 Сетка' : '⬜ Без сетки';
        btn.classList.toggle('active', !this.showGrid);
        this.render();
    }

    resetView() {
        // Возврат к центру острова
        this.currentZoom = 1;
        this.updateCanvasSize();
        
        const centerX = (this.canvas.offsetWidth - this.container.clientWidth) / 2;
        const centerY = (this.canvas.offsetHeight - this.container.clientHeight) / 2;
        
        this.animateMoveTo(
            this.container.scrollLeft,
            this.container.scrollTop,
            centerX,
            centerY
        );
        
        this.render();
        document.getElementById('zoomLevel').textContent = '100%';
    }

    showPlotDetails(plot) {
        // Заполняем базовую информацию
        document.getElementById('plotId').textContent = plot.plotid;
        document.getElementById('plotCoords').textContent = `Координаты: X:${plot.coordinates.x}, Y:${plot.coordinates.y}`;
        
        // Статус и цены
        document.getElementById('plotStatus').textContent = this.getStatusText(plot.status);
        document.getElementById('plotStatus').className = `status-badge ${plot.status}`;
        document.getElementById('rbtcPrice').textContent = `${plot.pricerbtc} RBTC`;
        document.getElementById('ryabaksPrice').textContent = `${plot.priceryabaks.toLocaleString()} рябаков`;

        // Информация о зоне
        document.getElementById('zoneType').textContent = this.getZoneDisplayName(plot.zonetype);
        document.getElementById('zoneType').className = `zone-type ${plot.zonetype}`;
        
        if (plot.zonebonus) {
            document.getElementById('zoneBonuses').innerHTML = `
                <div class="bonus-item">
                    <span class="bonus-icon">${this.getBonusIcon(plot.zonebonus.type)}</span>
                    <span class="bonus-text">${plot.zonebonus.description}</span>
                </div>
            `;
        } else {
            document.getElementById('zoneBonuses').innerHTML = '<em>Бонусы неизвестны</em>';
        }

        // Информация о владельце
        const ownerInfo = document.getElementById('ownerData');
        if (plot.ownerid) {
            ownerInfo.innerHTML = `👑 Владелец: Игрок #${plot.ownerid}`;
            if (plot.purchasedat) {
                ownerInfo.innerHTML += `<br>📅 Куплен: ${new Date(plot.purchasedat).toLocaleDateString()}`;
            }
        } else {
            ownerInfo.innerHTML = '<em>Участок не куплен</em>';
        }

        const discovererInfo = document.getElementById('discovererData');
        if (plot.discoveredby) {
            discovererInfo.innerHTML = `🗺️ Исследователь: Игрок #${plot.discoveredby}`;
            if (plot.discoveredat) {
                discovererInfo.innerHTML += `<br>📅 Открыт: ${new Date(plot.discoveredat).toLocaleDateString()}`;
            }
        } else {
            discovererInfo.innerHTML = '<em>Участок еще не исследован</em>';
        }

        // Информация о постройках (заглушка для MVP)
        document.getElementById('buildingsInfo').innerHTML = '<em>В MVP версии постройки пока недоступны</em>';

        this.currentPlot = plot;
        document.getElementById('plotModal').style.display = 'block';
    }

    getBonusIcon(bonusType) {
        const icons = {
            'crops': '🌾',
            'wood': '🪵', 
            'mining': '⛏️',
            'fishing': '🎣',
            'rbtc': '💎'
        };
        return icons[bonusType] || '💫';
    }

    getStatusText(status) {
        const statusMap = {
            'undiscovered': 'Неоткрытый',
            'available': 'Доступен для покупки',
            'owned': 'В собственности',
            'forsale': 'Продается игроком'
        };
        return statusMap[status] || status;
    }

    closeModal() {
        document.getElementById('plotModal').style.display = 'none';
        this.currentPlot = null;
    }

    // Интеграция с Telegram ботом
    openInGame() {
        if (tg && this.currentPlot) {
            // Отправляем данные обратно в бот
            tg.sendData(JSON.stringify({
                action: 'open_plot',
                plotid: this.currentPlot.plotid,
                coordinates: this.currentPlot.coordinates
            }));
            tg.close();
        } else {
            alert('Функция доступна только в Telegram боте');
        }
    }

    openInBot() {
        if (tg) {
            // Переход в бот
            tg.openTelegramLink('https://t.me/ryabotislandbot');
        } else {
            window.open('https://t.me/ryabotislandbot', '_blank');
        }
    }
}

// Запуск приложения
window.addEventListener('DOMContentLoaded', () => {
    console.log('🏝️ Загружаем карту Ryabot Island MVP...');
    window.ryabotIslandMap = new RyabotIslandMap();
});
