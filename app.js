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
        
        // Цвета статусов участков
        this.statusColors = {
            'unexplored': '#95A5A6',     // Серый - неизученные
            'discovered': '#2ECC71',     // Зеленый - открытые
            'fully_explored': '#3498DB', // Голубой - полностью изученные
            'owned': '#9B59B6',          // Фиолетовый - купленные
            'for_sale': '#E67E22'        // Оранжевый - продается
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

        // Размеры участков
        this.baseCellSize = 10;

        // События для ленты новостей
        this.events = [];
        this.eventUpdateInterval = null;

        // Типы бонусов
        this.bonusTypes = {
            agriculture: {
                'wheat_yield': 'Пшеница',
                'corn_yield': 'Кукуруза', 
                'potato_yield': 'Картофель',
                'carrot_yield': 'Морковь'
            },
            livestock: {
                'cow_milk': 'Молоко коров',
                'pig_meat': 'Свинина',
                'chicken_eggs': 'Куриные яйца',
                'sheep_wool': 'Овечья шерсть'
            },
            mining: {
                'iron_mining': 'Добыча железа',
                'gold_mining': 'Добыча золота',
                'stone_quarry': 'Добыча камня',
                'coal_mining': 'Добыча угля'
            },
            production: {
                'wood_cutting': 'Лесозаготовка',
                'fish_catch': 'Рыбная ловля',
                'honey_production': 'Производство меда'
            }
        };

        // Фильтры
        this.activeFilters = {
            status: 'all',
            bonus: 'all',
            owner: 'all'
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
        await this.loadPlots();
        this.setupEventListeners();
        this.startEventUpdates();
        this.render();
        this.updateIslandStats();
        console.log('✅ Карта игрового острова готова!');
    }

    async loadPlots() {
        console.log('📡 Загрузка данных острова из Supabase...');
        try {
            const { data, error } = await supabase
                .from('plots')
                .select(`
                    id, coord_x, coord_y, status, price, 
                    owner_telegram_id, discovery_date, discovered_by_telegram_id,
                    exploration_progress, explored_by_telegram_id, last_explored_date,
                    bonus_type, bonus_value, neighbor_bonus_value,
                    accumulated_value, passive_income_rate, last_income_collected,
                    buildings_farm_wheat, buildings_farm_corn, buildings_barn_cows,
                    buildings_barn_pigs, buildings_coop_chickens, buildings_mine_iron,
                    buildings_mine_gold, buildings_sawmill, buildings_quarry, 
                    buildings_house, occupied_space, available_space, tenants,
                    image_url
                `)
                .limit(10000);

            if (error) throw error;
            this.plots = data || [];

            if (this.plots.length < 10000) {
                this.generateMissingPlots();
            }

            console.log(`✅ Загружено ${this.plots.length} участков острова`);
            this.calculateNeighborBonuses();

        } catch (error) {
            console.warn('⚠️ Создаем тестовые данные локально:', error);
            this.generateAllPlotsLocally();
        }
    }

    generateAllPlotsLocally() {
        console.log('🏝️ Генерируем остров с тестовыми данными...');
        this.plots = [];
        
        for (let x = 0; x < 100; x++) {
            for (let y = 0; y < 100; y++) {
                const id = y * 100 + x + 1;
                
                // Случайное распределение статусов для тестирования
                let status = 'unexplored';
                const rand = Math.random();
                if (rand > 0.7) status = 'discovered';
                if (rand > 0.85) status = 'fully_explored';
                if (rand > 0.95) status = 'owned';
                if (rand > 0.98) status = 'for_sale';
                
                // Случайный бонус если участок открыт
                let bonusType = null;
                let bonusValue = 0;
                if (status !== 'unexplored') {
                    const categories = Object.keys(this.bonusTypes);
                    const category = categories[Math.floor(Math.random() * categories.length)];
                    const bonuses = Object.keys(this.bonusTypes[category]);
                    bonusType = bonuses[Math.floor(Math.random() * bonuses.length)];
                    bonusValue = Math.floor(Math.random() * 20) + 5; // 5-25%
                }

                // Случайные постройки для изученных участков
                const buildings = {};
                let playersCount = 0;
                if (status === 'fully_explored' || status === 'owned') {
                    if (Math.random() > 0.6) {
                        buildings.farm_wheat = Math.floor(Math.random() * 3);
                        buildings.barn_cows = Math.floor(Math.random() * 2);
                        buildings.house = Math.floor(Math.random() * 5);
                        playersCount = Math.floor(Math.random() * 8) + 1; // 1-8 игроков
                    }
                }

                this.plots.push({
                    id: id,
                    coord_x: x,
                    coord_y: y,
                    status: status,
                    price: status === 'for_sale' ? Math.round(1000 + Math.random() * 50000) : Math.round(100 + Math.random() * 400),
                    owner_telegram_id: status === 'owned' ? Math.floor(Math.random() * 1000000) : null,
                    discovery_date: status !== 'unexplored' ? '2025-09-' + (Math.floor(Math.random() * 28) + 1) : null,
                    discovered_by_telegram_id: status !== 'unexplored' ? Math.floor(Math.random() * 1000000) : null,
                    exploration_progress: status === 'discovered' ? Math.floor(Math.random() * 70) + 10 : (status !== 'unexplored' ? 100 : 0),
                    explored_by_telegram_id: status !== 'unexplored' ? Math.floor(Math.random() * 1000000) : null,
                    bonus_type: bonusType,
                    bonus_value: bonusValue,
                    neighbor_bonus_value: 0,
                    accumulated_value: status !== 'unexplored' ? Math.round(Math.random() * 10000) : 0,
                    passive_income_rate: status === 'owned' ? (Math.random() * 5 + 1).toFixed(1) : 0,
                    buildings_count: Object.values(buildings).reduce((a, b) => a + b, 0),
                    players_count: playersCount,
                    occupied_space: playersCount * Math.floor(Math.random() * 15) + 5,
                    available_space: 100,
                    image_url: (status === 'owned' && Math.random() > 0.7) ? 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop' : null
                });
            }
        }

        this.calculateNeighborBonuses();
        console.log('🎲 Тестовый остров создан!');
    }

    calculateNeighborBonuses() {
        // Вычисляем бонусы от соседних участков (в 2 раза слабее)
        this.plots.forEach(plot => {
            if (!plot.bonus_type) return;
            
            let neighborBonus = 0;
            const neighbors = this.getNeighbors(plot.coord_x, plot.coord_y);
            
            neighbors.forEach(neighbor => {
                if (neighbor && neighbor.bonus_type === plot.bonus_type) {
                    neighborBonus += Math.floor(neighbor.bonus_value / 2);
                }
            });
            
            plot.neighbor_bonus_value = neighborBonus;
        });
    }

    getNeighbors(x, y) {
        const neighbors = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < 100 && ny >= 0 && ny < 100) {
                    neighbors.push(this.findPlotByCoords(nx, ny));
                }
            }
        }
        return neighbors;
    }

    startEventUpdates() {
        // Генерируем случайные события для ленты
        this.generateRandomEvents();
        this.updateEventsFeed();
        
        // Обновляем события каждые 10 секунд
        this.eventUpdateInterval = setInterval(() => {
            if (Math.random() > 0.7) { // 30% шанс нового события
                this.generateRandomEvents();
                this.updateEventsFeed();
            }
        }, 10000);
    }

    generateRandomEvents() {
        const eventTemplates = [
            { type: 'discovery', text: '🗺️ Игрок{id} открыл участок X:{x} Y:{y}' },
            { type: 'exploration', text: '🔬 Участок X:{x} Y:{y} изучен на {progress}%' },
            { type: 'purchase', text: '💰 Игрок{id} купил участок X:{x} Y:{y}' },
            { type: 'building', text: '🏗️ На X:{x} Y:{y} построена {building}' },
            { type: 'milestone', text: '🎉 Остров исследован на {percent}%!' }
        ];
        
        const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
        const randomPlot = this.plots[Math.floor(Math.random() * this.plots.length)];
        
        let eventText = template.text
            .replace('{id}', Math.floor(Math.random() * 1000))
            .replace('{x}', randomPlot.coord_x)
            .replace('{y}', randomPlot.coord_y)
            .replace('{progress}', Math.floor(Math.random() * 100))
            .replace('{building}', 'пшеничная ферма')
            .replace('{percent}', '23.4');
            
        this.events.unshift({
            id: Date.now(),
            text: eventText,
            timestamp: new Date()
        });
        
        // Оставляем только последние 5 событий
        this.events = this.events.slice(0, 5);
    }

    updateEventsFeed() {
        const feed = document.getElementById('eventsFeed');
        if (!feed) return;
        
        feed.innerHTML = this.events
            .map(event => `<span class="event-item">${event.text}</span>`)
            .join('');
    }

    updateIslandStats() {
        const totalPlots = this.plots.length;
        const discoveredPlots = this.plots.filter(p => p.status !== 'unexplored').length;
        const fullyExploredPlots = this.plots.filter(p => p.status === 'fully_explored' || p.status === 'owned').length;
        const ownedPlots = this.plots.filter(p => p.status === 'owned').length;
        const plotsWithBuildings = this.plots.filter(p => p.buildings_count > 0).length;

        const discoveredPercent = ((discoveredPlots / totalPlots) * 100).toFixed(1);
        const exploredPercent = ((fullyExploredPlots / totalPlots) * 100).toFixed(1);
        const ownedPercent = ((ownedPlots / totalPlots) * 100).toFixed(1);
        const buildingsPercent = ((plotsWithBuildings / totalPlots) * 100).toFixed(1);

        document.getElementById('totalPlots').textContent = totalPlots.toLocaleString();
        document.getElementById('discoveredPlots').textContent = discoveredPlots.toLocaleString();
        document.getElementById('discoveredPercent').textContent = discoveredPercent + '%';
        document.getElementById('exploredPlots').textContent = fullyExploredPlots.toLocaleString();
        document.getElementById('exploredPercent').textContent = exploredPercent + '%';
        document.getElementById('ownedPlots').textContent = ownedPlots.toLocaleString();
        document.getElementById('ownedPercent').textContent = ownedPercent + '%';
        document.getElementById('buildingsPlots').textContent = plotsWithBuildings.toLocaleString();
        document.getElementById('buildingsPercent').textContent = buildingsPercent + '%';
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

        // Фильтры
        document.getElementById('filterStatus').addEventListener('change', (e) => {
            this.activeFilters.status = e.target.value;
            this.render();
        });
        
        document.getElementById('filterBonus').addEventListener('change', (e) => {
            this.activeFilters.bonus = e.target.value;
            this.render();
        });

        // Остальные события
        document.getElementById('showGrid').addEventListener('click', () => this.toggleGrid());

        // Модальное окно
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
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
        
        if (this.activeFilters.bonus !== 'all') {
            if (this.activeFilters.bonus === 'none' && plot.bonus_type) return false;
            if (this.activeFilters.bonus !== 'none' && plot.bonus_type !== this.activeFilters.bonus) return false;
        }
        
        return true;
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.imageSmoothingEnabled = false;
        
        this.plots.forEach(plot => {
            if (this.shouldRenderPlot(plot)) {
                this.renderPlot(plot);
            }
        });
        
        if (this.showGrid) {
            this.renderGrid();
        }
    }

    renderPlot(plot) {
        const x = plot.coord_x * this.currentCellSize;
        const y = plot.coord_y * this.currentCellSize;
        const size = this.currentCellSize;

        // Основной цвет по статусу
        let color = this.statusColors[plot.status] || this.statusColors.unexplored;
        
        // Если есть картинка и участок достаточно большой, показываем её
        const hasImage = plot.image_url && plot.image_url.trim() !== '';
        if (hasImage && size > 8 && plot.status !== 'unexplored') {
            // Здесь можно добавить загрузку и отображение картинок
            // Пока просто меняем цвет на золотистый для участков с картинками
            color = '#F1C40F';
        }

        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, size, size);

        // Добавляем индикаторы для больших участков
        if (size > 15) {
            // Показываем прогресс исследования для открытых участков
            if (plot.status === 'discovered' && plot.exploration_progress > 0) {
                const progressHeight = (size * plot.exploration_progress / 100);
                this.ctx.fillStyle = 'rgba(52, 152, 219, 0.7)';
                this.ctx.fillRect(x, y + size - progressHeight, size, progressHeight);
            }

            // Показываем количество игроков для участков с постройками
            if (plot.players_count > 0) {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                this.ctx.font = `${Math.min(size / 3, 12)}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(plot.players_count.toString(), x + size/2, y + size/2 + 4);
            }

            // Рамка для владельцев
            if (plot.status === 'owned') {
                this.ctx.strokeStyle = '#2C3E50';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x, y, size, size);
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
        let bonusText = 'Нет бонуса';
        
        if (plot.bonus_type) {
            const category = Object.keys(this.bonusTypes).find(cat => 
                this.bonusTypes[cat][plot.bonus_type]
            );
            if (category) {
                const bonusName = this.bonusTypes[category][plot.bonus_type];
                bonusText = `${bonusName} +${plot.bonus_value}%`;
                if (plot.neighbor_bonus_value > 0) {
                    bonusText += ` (соседи: +${plot.neighbor_bonus_value}%)`;
                }
            }
        }
        
        this.hoverInfo.innerHTML = `
            <strong>Участок ${plot.id}</strong><br>
            <span class="status-${plot.status}">● ${statusText}</span><br>
            💎 ${bonusText}<br>
            ${plot.players_count > 0 ? `👥 ${plot.players_count} игроков<br>` : ''}
            💰 ${plot.accumulated_value ? Math.round(plot.accumulated_value).toLocaleString() + ' монет' : '0 монет'}
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
        // Заполняем базовую информацию
        document.getElementById('plotId').textContent = plot.id;
        document.getElementById('plotCoords').textContent = `X:${plot.coord_x}, Y:${plot.coord_y}`;
        document.getElementById('plotStatus').textContent = this.getStatusText(plot.status);
        document.getElementById('plotStatus').className = `status-badge ${plot.status}`;
        
        // Информация об исследовании
        const discoveryInfo = document.getElementById('discoveryInfo');
        if (plot.status === 'unexplored') {
            discoveryInfo.innerHTML = '<em>Участок еще не исследован</em>';
        } else {
            let info = '';
            if (plot.discovery_date) {
                info += `🗺️ Открыт: ${new Date(plot.discovery_date).toLocaleDateString()}<br>`;
            }
            if (plot.exploration_progress > 0 && plot.exploration_progress < 100) {
                info += `🔬 Изучен на: ${plot.exploration_progress}%<br>`;
            }
            if (plot.exploration_progress === 100) {
                info += `✅ Полностью изучен<br>`;
            }
            discoveryInfo.innerHTML = info || 'Информация недоступна';
        }

        // Бонус участка
        const bonusInfo = document.getElementById('bonusInfo');
        if (plot.bonus_type) {
            const category = Object.keys(this.bonusTypes).find(cat => 
                this.bonusTypes[cat][plot.bonus_type]
            );
            if (category) {
                const bonusName = this.bonusTypes[category][plot.bonus_type];
                let bonusText = `💎 ${bonusName}: +${plot.bonus_value}%`;
                if (plot.neighbor_bonus_value > 0) {
                    bonusText += `<br>🔗 Бонус от соседей: +${plot.neighbor_bonus_value}%`;
                    bonusText += `<br><strong>Итого: +${plot.bonus_value + plot.neighbor_bonus_value}%</strong>`;
                }
                bonusInfo.innerHTML = bonusText;
            }
        } else {
            bonusInfo.innerHTML = '<em>Бонус неизвестен</em>';
        }

        // Экономическая информация
        const economicInfo = document.getElementById('economicInfo');
        let econText = `💰 Накопленная ценность: ${Math.round(plot.accumulated_value || 0).toLocaleString()} монет<br>`;
        if (plot.passive_income_rate > 0) {
            econText += `📈 Пассивный доход: ${plot.passive_income_rate}% в месяц<br>`;
        }
        if (plot.status === 'for_sale') {
            econText += `🏷️ Цена продажи: ${Math.round(plot.price).toLocaleString()} монет`;
        }
        economicInfo.innerHTML = econText;

        // Информация о постройках
        const buildingsInfo = document.getElementById('buildingsInfo');
        if (plot.players_count > 0) {
            let buildingText = `👥 Игроков на участке: <strong>${plot.players_count}</strong><br>`;
            buildingText += `📏 Занято места: ${plot.occupied_space || 0}/100 гектаров<br>`;
            
            if (plot.buildings_count > 0) {
                buildingText += `🏗️ Всего построек: ${plot.buildings_count}<br>`;
                // Здесь можно добавить детализацию по типам построек
            }
            
            buildingsInfo.innerHTML = buildingText;
        } else {
            buildingsInfo.innerHTML = '<em>На участке нет построек</em>';
        }

        // Картинка участка
        const imageContainer = document.getElementById('plotImageContainer');
        if (plot.image_url && plot.status !== 'unexplored') {
            imageContainer.innerHTML = `
                <img src="${plot.image_url}" 
                     alt="Участок ${plot.id}" 
                     style="max-width: 100%; border-radius: 8px;"
                     onerror="this.style.display='none'">
            `;
        } else {
            imageContainer.innerHTML = '<p style="color: #666; font-style: italic;">Изображение недоступно</p>';
        }

        // Информация о владельце
        const ownerInfo = document.getElementById('ownerInfo');
        if (plot.owner_telegram_id) {
            ownerInfo.innerHTML = `👑 Владелец: Игрок #${plot.owner_telegram_id}`;
        } else {
            ownerInfo.innerHTML = '<em>Участок не куплен</em>';
        }

        this.currentPlot = plot;
        document.getElementById('plotModal').style.display = 'block';
    }

    getStatusText(status) {
        const statusMap = {
            'unexplored': 'Неизученный',
            'discovered': 'Открытый', 
            'fully_explored': 'Полностью изученный',
            'owned': 'Куплен игроком',
            'for_sale': 'Продается'
        };
        return statusMap[status] || status;
    }

    closeModal() {
        document.getElementById('plotModal').style.display = 'none';
        this.currentPlot = null;
    }
}

// Запуск приложения
window.addEventListener('DOMContentLoaded', () => {
    console.log('🏝️ Загружаем карту игрового острова...');
    window.islandMap = new IslandMap();
});
