// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ И ПОЛУЧЕНИЕ ЭЛЕМЕНТОВ
// ==========================================
const audioPlayer = document.getElementById('audio-player');
const trackListEl = document.getElementById('track-list');
const pageTitle = document.getElementById('page-title');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');

// Навигация
const navHome = document.getElementById('nav-home');
const navSearch = document.getElementById('nav-search');
const navLibrary = document.getElementById('nav-library');

// Элементы плеера
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerCover = document.getElementById('player-cover');
const seekSlider = document.getElementById('seek-slider');
const volumeSlider = document.getElementById('volume-slider');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');

// Авторизация
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authContainer = document.getElementById('auth-container');

// Глобальное состояние
let currentTracks = [];
let currentTrackIndex = -1;
let isPlaying = false;
let isLoginMode = true;

// ==========================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const getValidCover = (url) => url || '/img/default-cover.png';

// ГЛАВНАЯ ФУНКЦИЯ: Определяет, откуда брать аудио
function getStreamUrl(track) {
  // 1. Если бэкенд уже дал прямую ссылку (SoundCloud)
  if (track.stream_url) return track.stream_url; 
  // 2. Если это внешний трек с прямой ссылкой (Audius/iTunes)
  if (track.is_external && track.file_url) return track.file_url; 
  
  // 3. Если это локальный трек, загруженный на сервер
  return `/api/tracks/${track.id}/stream`;
}

// Функция fetch с таймаутом (защита от зависаний сервера)
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ==========================================
// 3. РЕНДЕР ТРЕКОВ (С КАРТИНКАМИ И ЛАЙКАМИ)
// ==========================================
function renderTracks(tracksArray) {
  currentTracks = tracksArray || [];
  trackListEl.innerHTML = '';
  
  if (currentTracks.length === 0) {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ничего не найдено.</p>';
    return;
  }

  currentTracks.forEach((track, index) => {
    const div = document.createElement('div');
    div.className = 'track-item';
    div.dataset.index = index;
    
    // Используем referrerpolicy, чтобы картинки грузились без блокировок
    div.innerHTML = `
      <img src="${getValidCover(track.cover_url)}" class="track-cover" alt="Cover" referrerpolicy="no-referrer">
      <div class="track-info">
        <div class="track-title">${track.title}</div>
        <div class="track-artist">${track.artist_name || 'Неизвестен'}</div>
      </div>
      <div class="track-duration">${formatTime(track.duration)}</div>
      <button class="btn-like" title="Сохранить в медиатеку">♥</button>
    `;

    // Умная замена битой картинки на локальную
    const imgEl = div.querySelector('.track-cover');
    imgEl.onerror = function() {
      this.onerror = null; 
      this.src = '/img/default-cover.png';
    };

    // Клик по треку (воспроизведение)
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-like')) return; 
      document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      currentTrackIndex = index;
      playTrack(track);
    });

    // Клик по сердечку (сохранение в медиатеку)
    const likeBtn = div.querySelector('.btn-like');
    likeBtn.addEventListener('click', async () => {
      try {
        const streamUrl = getStreamUrl(track);
        
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            track_id: String(track.id),
            title: track.title,
            artist_name: track.artist_name,
            cover_url: track.cover_url,
            duration: track.duration,
            stream_url: streamUrl
          })
        });

        if (res.status === 401) {
          alert('Войдите в аккаунт, чтобы сохранять треки!');
          authModal.classList.add('active');
          return;
        }
        if (res.ok) {
          likeBtn.classList.add('liked');
          likeBtn.textContent = '❤';
        }
      } catch (err) { console.error('Ошибка сохранения:', err); }
    });

    trackListEl.appendChild(div);
  });
}

// ==========================================
// 4. УПРАВЛЕНИЕ ПЛЕЕРОМ
// ==========================================
function playTrack(track) {
  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist_name || 'Неизвестен';
  
  // Установка обложки в плеере
  if (track.cover_url) {
    playerCover.src = track.cover_url;
    playerCover.classList.remove('hidden');
  } else {
    playerCover.classList.add('hidden');
  }

  // Установка источника аудио
  audioPlayer.src = getStreamUrl(track);
  
  // Воспроизведение
  audioPlayer.play().then(() => {
    isPlaying = true;
    btnPlay.textContent = '⏸';
  }).catch(err => {
    console.error('Ошибка аудио:', err);
    btnPlay.textContent = '▶';
    isPlaying = false;
  });
}

btnPlay.addEventListener('click', () => {
  if (!audioPlayer.src) return;
  if (isPlaying) {
    audioPlayer.pause();
    btnPlay.textContent = '▶';
    isPlaying = false;
  } else {
    audioPlayer.play();
    btnPlay.textContent = '⏸';
    isPlaying = true;
  }
});

btnNext.addEventListener('click', () => {
  if (currentTracks.length === 0) return;
  let nextIndex = (currentTrackIndex + 1) % currentTracks.length;
  document.querySelector(`.track-item[data-index="${nextIndex}"]`)?.click();
});

btnPrev.addEventListener('click', () => {
  if (currentTracks.length === 0) return;
  let prevIndex = (currentTrackIndex - 1 + currentTracks.length) % currentTracks.length;
  document.querySelector(`.track-item[data-index="${prevIndex}"]`)?.click();
});

audioPlayer.addEventListener('timeupdate', () => {
  if (!audioPlayer.duration) return;
  seekSlider.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
});

audioPlayer.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatTime(audioPlayer.duration);
});

seekSlider.addEventListener('input', () => {
  if (!audioPlayer.duration) return;
  audioPlayer.currentTime = (seekSlider.value / 100) * audioPlayer.duration;
});

volumeSlider.addEventListener('input', () => {
  audioPlayer.volume = volumeSlider.value;
});

// Автоматическое включение следующего трека
audioPlayer.addEventListener('ended', () => btnNext.click());

// ==========================================
// 5. ВКЛАДКИ И НАВИГАЦИЯ
// ==========================================
function switchTab(activeTab, title, showSearch = false) {
  [navHome, navSearch, navLibrary].forEach(el => el.classList.remove('active'));
  activeTab.classList.add('active');
  pageTitle.textContent = title;
  searchContainer.style.display = showSearch ? 'block' : 'none';
}

// 1. Главная (Рекомендации)
navHome.addEventListener('click', async () => {
  switchTab(navHome, 'Рекомендации');
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка...</p>';
  try {
    const res = await fetchWithTimeout('/api/search/trending');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderTracks(data.tracks);
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Сервер не отвечает. Проверьте терминал.</p>';
  }
});

// 2. Поиск
navSearch.addEventListener('click', () => {
  switchTab(navSearch, 'Поиск по миру', true);
  searchInput.focus();
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Введите название трека...</p>';
});

let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  
  if (query.length < 2) {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Введите хотя бы 2 символа</p>';
    return;
  }

  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ищем музыку...</p>';

  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      renderTracks(data.tracks);
    } catch (err) {
      trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка поиска. Сервер не отвечает.</p>';
    }
  }, 600);
});

// 3. Медиатека
navLibrary.addEventListener('click', async () => {
  switchTab(navLibrary, 'Моя медиатека');
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка...</p>';
  try {
    const res = await fetchWithTimeout('/api/library');
    if (res.status === 401) {
      trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Войдите в аккаунт, чтобы увидеть медиатеку.</p>';
      return;
    }
    const data = await res.json();
    renderTracks(data.tracks);
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка загрузки медиатеки.</p>';
  }
});

// ==========================================
// 6. АВТОРИЗАЦИЯ
// ==========================================
authContainer.addEventListener('click', (e) => {
  if (e.target.id === 'btn-open-auth') authModal.classList.add('active');
  if (e.target.id === 'btn-logout') logout();
});

function updateAuthUI(user) {
  if (user) {
    authContainer.innerHTML = `
      <div class="profile-info">
        <span>👤 ${user.email}</span>
        <button class="btn-logout" id="btn-logout">Выйти</button>
      </div>
    `;
  } else {
    authContainer.innerHTML = `<button class="btn-auth" id="btn-open-auth">Войти</button>`;
  }
}

document.getElementById('btn-close-auth').addEventListener('click', () => authModal.classList.remove('active'));
document.getElementById('btn-toggle-auth').addEventListener('click', (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  document.getElementById('modal-title').textContent = isLoginMode ? 'Вход' : 'Регистрация';
  document.getElementById('btn-submit-auth').textContent = isLoginMode ? 'Войти' : 'Зарегистрироваться';
  document.getElementById('auth-toggle-text').textContent = isLoginMode ? 'Нет аккаунта?' : 'Уже есть аккаунт?';
  document.getElementById('btn-toggle-auth').textContent = isLoginMode ? 'Зарегистрироваться' : 'Войти';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
  
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    
    authModal.classList.remove('active');
    updateAuthUI(data.user);
    authForm.reset();
    
    // Если мы в медиатеке, обновляем её после входа
    if (navLibrary.classList.contains('active')) navLibrary.click();
  } catch (err) {
    alert(err.message);
  }
});

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  updateAuthUI(null);
  navHome.click(); // Возвращаемся на главную
}

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      updateAuthUI(data.user);
    }
  } catch (err) { }
}

// ==========================================
// 7. ЗАПУСК ПРИ ЗАГРУЗКЕ
// ==========================================
checkAuth();
navHome.click(); // Сразу грузим главную страницу с рекомендациями