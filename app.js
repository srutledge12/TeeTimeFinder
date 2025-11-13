// Golf Tee Times Frontend (productized)
// Uses your provided backend function and displays results with price and Chronogolf links.

// ---- Backend function (as provided) ----
const BASE_URL = "https://getcourseavailability.azurewebsites.net/api";
const API_CODE = "r5KdTmvZoTt1gd7SiV6MYKKeCj8TIia8jU2F4oFud1NSAzFu0Y6jZw==";
const CORS_PROXY = "https://corsproxy.io/?";

async function getTeeTime(zipCode, date, preferredTime, timeRange, groupSize) {
  try {
    // Step 1: Get courses
    const coursesResponse = await fetch(`${BASE_URL}/get_courses?zip_code=${zipCode}&code=${API_CODE}`);

    if (!coursesResponse.ok) {
      throw new Error(`Failed to fetch courses: ${coursesResponse.status}`);
    }

    const courses = await coursesResponse.json();

    if (!courses || courses.length === 0) {
      return { error: "No courses found." };
    }

    // Step 2: Fetch tee times for all courses
    const combinedBody = [];

    for (const course of courses) {
      try {
        const combinedCourseTeeTime = [];
        let page = 1;

        while (true) {
          const chronoUrl = "https://www.chronogolf.com/marketplace/v2/teetimes";
          const params = new URLSearchParams({
            start_date: date,
            course_ids: course.uuid,
            page: page.toString()
          });

          const response = await fetch(`${CORS_PROXY}${chronoUrl}?${params}`);

          if (response.ok) {
            const data = await response.json();
            const teeTimes = data.teetimes || [];

            if (teeTimes.length === 0) {
              break;
            }

            combinedCourseTeeTime.push(...teeTimes);
            page++;
          } else {
            throw new Error(`API call failed with status ${response.status}`);
          }
        }

        if (combinedCourseTeeTime.length > 0) {
          combinedBody.push({
            tee_times: combinedCourseTeeTime,
            preferred_time: preferredTime,
            time_range: timeRange,
            group_size: groupSize,
            course_name: course.name,
            course_slug: course.slug,
            date: date
          });
        }
      } catch (error) {
        console.error(`Failed to fetch tee times for course '${course.name}': ${error.message}`);
      }
    }

    if (combinedBody.length === 0) {
      return { error: "No tee times found." };
    }

    // Step 3: Filter tee times
    const filterResponse = await fetch(`${CORS_PROXY}${BASE_URL}/filter_tee_times?code=${API_CODE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(combinedBody)
    });

    if (!filterResponse.ok) {
      throw new Error(`Filter API call failed with status ${filterResponse.status}`);
    }

    const filteredTeeTimes = await filterResponse.json();
    return filteredTeeTimes;

  } catch (error) {
    return { error: `Error: ${error.message}` };
  }
}

// ---- UI logic ----
const els = {
  form: document.getElementById('search-form'),
  zip: document.getElementById('zipCode'),
  date: document.getElementById('date'),
  time: document.getElementById('preferredTime'),
  range: document.getElementById('timeRange'),
  rangeOut: document.getElementById('timeRangeOutput'),
  group: document.getElementById('groupSize'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  searchBtn: document.getElementById('searchBtn')
};

function setDefaultValues() {
  els.zip.value = '84106';
  const today = new Date();
  const minDate = toInputDate(today);
  els.date.min = minDate;

  const threeDays = new Date(today);
  threeDays.setDate(today.getDate() + 3);
  els.date.value = toInputDate(threeDays);

  els.time.value = '12:00';
  els.range.value = '1';
  updateRangeOutput();
  els.group.value = '4';
}

function toInputDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateRangeOutput() {
  const hours = parseFloat(els.range.value || '0');
  els.rangeOut.textContent = `±${formatHours(hours)}`;
}

function formatHours(h) {
  const whole = Math.trunc(h);
  const half = Math.abs(h - whole) >= 0.25 ? 30 : 0;
  if (whole === 0 && half === 0) return '0 hr';
  if (half === 0) return `${whole} hr${whole === 1 ? '' : 's'}`;
  if (whole === 0) return '30 min';
  return `${whole} hr ${half} min`;
}

function setLoading(loading, message = '') {
  els.searchBtn.disabled = loading;
  els.status.classList.toggle('error', false);
  if (loading) {
    els.status.innerText = message || 'Searching tee times...';
    renderSkeletons();
  } else if (message) {
    els.status.innerText = message;
  } else {
    els.status.innerText = '';
  }
}

function showError(message) {
  els.status.classList.add('error');
  els.status.innerText = message;
}

function clearResults() {
  els.results.innerHTML = '';
}

function renderSkeletons(count = 6) {
  clearResults();
  for (let i = 0; i < count; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton';
    els.results.appendChild(sk);
  }
}

function renderResults(courses) {
  clearResults();

  if (!Array.isArray(courses) || courses.length === 0) {
    els.results.innerHTML = '<p class="meta">No tee times found for your criteria.</p>';
    return;
  }

  // Sort by price ascending, then by number of tee times descending
  courses.sort((a, b) => {
    const pa = typeof a.price === 'number' ? a.price : Number.POSITIVE_INFINITY;
    const pb = typeof b.price === 'number' ? b.price : Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return (b.tee_times?.length || 0) - (a.tee_times?.length || 0);
  });

  for (const course of courses) {
    const card = document.createElement('article');
    card.className = 'course-card';

    const header = document.createElement('div');
    header.className = 'course-header';

    const name = document.createElement('h3');
    name.className = 'course-name';
    name.textContent = course.course_name || 'Unnamed course';

    const price = document.createElement('div');
    price.className = 'price';
    if (typeof course.price === 'number') {
      price.textContent = `$${course.price}`;
    } else {
      price.textContent = '';
    }

    header.appendChild(name);
    header.appendChild(price);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const count = course.tee_times?.length || 0;
    meta.textContent = `${count} time${count === 1 ? '' : 's'} available`;

    const chips = document.createElement('div');
    chips.className = 'chips';
    const times = Array.isArray(course.tee_times) ? course.tee_times : [];
    for (const t of times) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = t;
      chips.appendChild(chip);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    if (course.chronogolf_link) {
      const a = document.createElement('a');
      a.href = course.chronogolf_link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'link';
      a.textContent = 'Book on Chronogolf →';
      actions.appendChild(a);
    }

    card.appendChild(header);
    card.appendChild(meta);
    if (times.length) card.appendChild(chips);
    card.appendChild(actions);
    els.results.appendChild(card);
  }
}

function validateForm() {
  const zipValid = /^[0-9]{5}$/.test(els.zip.value.trim());
  if (!zipValid) {
    els.zip.focus();
    showError('Please enter a valid 5-digit US ZIP code.');
    return false;
  }
  if (!els.date.value) {
    els.date.focus();
    showError('Please select a date.');
    return false;
  }
  const todayStr = toInputDate(new Date());
  if (els.date.value < todayStr) {
    els.date.focus();
    showError('Date cannot be in the past.');
    return false;
  }
  if (!els.time.value) {
    els.time.focus();
    showError('Please choose a preferred time.');
    return false;
  }
  const range = parseFloat(els.range.value);
  if (isNaN(range) || range < 0) {
    els.range.focus();
    showError('Flexibility window must be zero or more hours.');
    return false;
  }
  const group = parseInt(els.group.value, 10);
  if (isNaN(group) || group < 1 || group > 4) {
    els.group.focus();
    showError('Group size must be between 1 and 4.');
    return false;
  }
  els.status.classList.remove('error');
  els.status.innerText = '';
  return true;
}

async function onSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const zip = els.zip.value.trim();
  const date = els.date.value;
  const preferredTime = els.time.value;
  const timeRange = parseFloat(els.range.value);
  const groupSize = parseInt(els.group.value, 10);

  setLoading(true, 'Searching tee times...');
  try {
    const result = await getTeeTime(zip, date, preferredTime, timeRange, groupSize);
    setLoading(false);
    if (result && !result.error) {
      renderResults(result);
      if (!Array.isArray(result)) {
        // If backend returns object (unexpected), render it visibly.
        els.results.innerHTML = `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
      }
    } else {
      showError(result?.error || 'Unknown error searching tee times.');
      clearResults();
    }
  } catch (err) {
    setLoading(false);
    showError(`Request failed: ${err.message}`);
    clearResults();
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

// Init
setDefaultValues();
els.range.addEventListener('input', updateRangeOutput);
els.form.addEventListener('submit', onSubmit);