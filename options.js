/*
  Localization
*/

// Localize all elements with a data-i18n="message_name" attribute
var localizedElements = document.querySelectorAll('[data-i18n]'), el, message;
for(var i = 0; i < localizedElements.length; i++) {
  el = localizedElements[i];
  message = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
  
  // Capitalize first letter if element has attribute data-i18n-caps
  if(el.hasAttribute('data-i18n-caps')) {
    message = message.charAt(0).toUpperCase() + message.substr(1);
  }
  
  el.innerHTML = message;
}

/*
  Form interaction
*/

var form = document.getElementById('options-form'),
  siteListEl = document.getElementById('site-list'),
  whitelistEl = document.getElementById('blacklist-or-whitelist'),
  showNotificationsEl = document.getElementById('show-notifications'),
  shouldRingEl = document.getElementById('should-ring'),
  clickRestartsEl = document.getElementById('click-restarts'),
  saveSuccessfulEl = document.getElementById('save-successful'),
  timeFormatErrorEl = document.getElementById('time-format-error'),
  startCallbacks = {}, durationEls = {}, 
  PREFS = null,
  mainPomodoroStatus = { running: false, mostRecentMode: 'break' };
  
durationEls['work'] = document.getElementById('work-duration');
durationEls['break'] = document.getElementById('break-duration');

var TIME_REGEX = /^([0-9]+)(:([0-9]{2}))?$/;

// Load data from storage
function loadOptions() {
  chrome.storage.local.get(['prefs', 'pomodoroStatus'], function(result) {
    PREFS = result.prefs;
    if (result.pomodoroStatus) {
      mainPomodoroStatus = result.pomodoroStatus;
    }
    
    // Update form values
    siteListEl.value = PREFS.siteList.join("\n");
    showNotificationsEl.checked = PREFS.showNotifications;
    shouldRingEl.checked = PREFS.shouldRing;
    clickRestartsEl.checked = PREFS.clickRestarts;
    whitelistEl.selectedIndex = PREFS.whitelist ? 1 : 0;

    var duration, minutes, seconds;
    for(var key in durationEls) {
      duration = PREFS.durations[key];
      seconds = duration % 60;
      minutes = (duration - seconds) / 60;
      if(seconds >= 10) {
        durationEls[key].value = minutes + ":" + seconds;
      } else if(seconds > 0) {
        durationEls[key].value = minutes + ":0" + seconds;
      } else {
        durationEls[key].value = minutes;
      }
      durationEls[key].onfocus = formAltered;
    }
    
    // Set UI state based on Pomodoro status
    if(mainPomodoroStatus.mostRecentMode == 'work' && mainPomodoroStatus.running) {
      startCallbacks.work();
    }
  });
}

form.onsubmit = function () {
  console.log("form submitted");
  var durations = {}, duration, durationStr, durationMatch;
  
  for(var key in durationEls) {
    durationStr = durationEls[key].value;
    durationMatch = durationStr.match(TIME_REGEX);
    if(durationMatch) {
      console.log(durationMatch);
      durations[key] = (60 * parseInt(durationMatch[1], 10));
      if(durationMatch[3]) {
        durations[key] += parseInt(durationMatch[3], 10);
      }
    } else {
      timeFormatErrorEl.className = 'show';
      return false;
    } 
  }
  
  console.log(durations);
  
  var newPrefs = {
    siteList: siteListEl.value.split(/\r?\n/),
    durations: durations,
    showNotifications: showNotificationsEl.checked,
    shouldRing: shouldRingEl.checked,
    clickRestarts: clickRestartsEl.checked,
    whitelist: whitelistEl.selectedIndex == 1
  };
  
  // Save to storage
  chrome.storage.local.set({prefs: newPrefs}, function() {
    PREFS = newPrefs;
    saveSuccessfulEl.className = 'show';
    
    // Send message to background script to update settings
    chrome.runtime.sendMessage({action: "updatePrefs", prefs: newPrefs});
  });
  
  return false;
}

siteListEl.onfocus = formAltered;
showNotificationsEl.onchange = formAltered;
shouldRingEl.onchange = formAltered;
clickRestartsEl.onchange = formAltered;
whitelistEl.onchange = formAltered;

function formAltered() {
  saveSuccessfulEl.removeAttribute('class');
  timeFormatErrorEl.removeAttribute('class');
}

function setInputDisabled(state) {
  siteListEl.disabled = state;
  whitelistEl.disabled = state;
  for(var key in durationEls) {
    durationEls[key].disabled = state;
  }
}

startCallbacks.work = function () {
  document.body.className = 'work';
  setInputDisabled(true);
}

startCallbacks.break = function () {
  document.body.removeAttribute('class');
  setInputDisabled(false);
}

// Listen for updates from background
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "pomodoroUpdate") {
    mainPomodoroStatus = request.status;
    if (request.status.mostRecentMode === 'work' && request.status.running) {
      startCallbacks.work();
    } else {
      startCallbacks.break();
    }
  }
});

// Initialize options
document.addEventListener('DOMContentLoaded', loadOptions);
