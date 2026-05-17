/**
 * i18n.js — Internationalisation (DE / EN)
 *
 * API:
 *   t(key, params?)       → translated string, fallback to DE, fallback to key
 *   setLanguage(lang)     → 'de' | 'en'  (persists to localStorage)
 *   getLanguage()         → 'de' | 'en'
 *   applyI18n(root?)      → walks DOM, replaces data-i18n* attributes
 *
 * Placeholder syntax in values:  "Hello {{name}}!"
 * Params object:                 t('greeting', { name: 'Lena' })
 */

// ── Dictionaries ──────────────────────────────────────────────────────────

const TRANSLATIONS = {

  de: {
    // App shell
    'app.title':                     'Baby Tracker',
    'app.description':               'Baby Tracker – Schlaf, Fütterung, Windeln und mehr.',

    // Offline / update banners
    'banner.offline':                '⚡ Offline — Änderungen werden gespeichert und später synchronisiert',
    'banner.update':                 '🔄 Update verfügbar',
    'banner.update.load':            'Jetzt laden',
    'banner.update.dismiss':         '✕',
    'banner.update.new':             'Neue Version verfügbar!',
    'banner.update.refresh':         'Aktualisieren',

    // Skip link
    'skip.link':                     'Zum Inhalt springen',

    // Firebase loading overlay
    'fb.loading':                    'Verbinde…',

    // Onboarding
    'ob.slide1.title':               'Willkommen beim Baby Tracker!',
    'ob.slide1.text':                'Behalte Schlaf, Fütterung und mehr deines Babys im Blick – auch offline.',
    'ob.slide2.title':               'Schlaf tracken',
    'ob.slide2.text':                'Tippe auf "Schlafen" wenn das Baby einschläft — und wieder wenn es aufwacht. Korrekturen sind jederzeit möglich.',
    'ob.slide3.title':               'Statistiken & Verlauf',
    'ob.slide3.text':                'Sieh Wochenzusammenfassungen, Balkendiagramme und WHO-Wachstumskurven.',
    'ob.slide4.title':               'Erinnerungen & Backup',
    'ob.slide4.text':                'Lass dich an Arzttermine erinnern und sichere deine Daten mit einem Klick.',
    'ob.btn.back':                   'Zurück',
    'ob.btn.next':                   'Weiter',

    // Notification banner
    'notif.banner.text':             '🔔 Benachrichtigungen aktivieren für Arzttermin-Erinnerungen',
    'notif.banner.enable':           'Aktivieren',

    // Home page
    'page.home.title':               'Start',
    'home.section.today':            'Heute',
    'home.empty':                    'Noch keine Einträge heute 🌱',
    'home.btn.sleep':                '🌙 Schlafen',
    'home.btn.sleep.active':         '😴 Aufgewacht ({{time}})',
    'home.btn.feed':                 '🍼 Fütterung',
    'home.btn.diaper':               '🧷 Windel',
    'home.btn.fix':                  '✏️ Schlafstart korrigieren',

    // Tracker page
    'page.tracker.title':            'Tracker',
    'tracker.section.feed':          '🍼 Fütterung',
    'tracker.section.diaper':        '🧷 Windel',
    'tracker.section.recent':        'Zuletzt eingetragen',
    'tracker.feed.placeholder':      'ml',
    'tracker.btn.add':               'Hinzufügen',

    // Feed types
    'feed.type.breast':              'Brust',
    'feed.type.bottle':              'Flasche',
    'feed.type.solids':              'Beikost',

    // Diaper types
    'diaper.type.wet':               'Nass',
    'diaper.type.dirty':             'Schmutzig',
    'diaper.type.both':              'Beides',
    'diaper.type.dry':               'Trocken',

    // Stats page
    'page.stats.title':              'Statistik',
    'stats.label.sleep':             'Schlaf (7 T)',
    'stats.label.feed':              'Fütterungen (7 T)',
    'stats.label.diaper':            'Windeln (7 T)',
    'stats.chart.title':             'Schlaf letzter 7 Tage',

    // Verlauf page
    'page.verlauf.title':            'Verlauf',
    'verlauf.filter.all':            'Alle',
    'verlauf.filter.sleep':          'Schlaf',
    'verlauf.filter.feed':           'Fütterung',
    'verlauf.filter.diaper':         'Windel',
    'verlauf.empty':                 'Keine Einträge für diesen Zeitraum.',
    'verlauf.loading':               'Lade Einträge…',
    'verlauf.btn.export':            '📥 CSV exportieren',

    // Growth page
    'page.wachstum.title':           'Wachstum',
    'growth.tab.weight':             'Gewicht',
    'growth.tab.height':             'Größe',
    'growth.tab.head':               'Kopfumfang',
    'growth.percentile.current':     'Aktuell: {{value}}',
    'growth.btn.weight':             '+ Gewicht eintragen',
    'growth.btn.height':             '+ Größe eintragen',
    'growth.btn.head':               '+ Kopfumfang eintragen',

    // Meilensteine page
    'page.meilensteine.title':       'Meilensteine',
    'milestones.loading':            'Lade Meilensteine…',

    // Gesundheit page
    'page.gesundheit.title':         'Gesundheit',
    'health.section.weight':         '⚖️ Gewicht',
    'health.section.height':         '📏 Größe',
    'health.section.appts':          '🏥 Arzttermine',
    'health.appt.placeholder.title': 'Termin (z.B. U5)',
    'health.appt.btn.add':           'Hinzufügen',
    'health.weight.empty':           'Noch kein Gewicht eingetragen.',
    'health.height.empty':           'Noch keine Größe eingetragen.',
    'health.appts.empty':            'Keine Arzttermine.',
    'home.today.empty':              'Noch keine Einträge heute.',

    // Tagesplan page
    'page.tagesplan.title':          'Tagesplan',
    'tagesplan.placeholder':         'Aktivität',
    'tagesplan.empty':               'Kein Plan für heute — füge Aktivitäten hinzu 📝',

    // Einstellungen page
    'page.einstellungen.title':      'Einstellungen',
    'settings.section.children':     '👶 Kinder',
    'settings.btn.add_child':        '+ Kind hinzufügen',
    'settings.section.appearance':   '🎨 Erscheinungsbild',
    'settings.btn.dark_mode':        '🌙 Dark Mode',
    'settings.btn.light_mode':       '☀️ Light Mode',
    'settings.section.pwa':          '📱 App installieren',
    'settings.pwa.hint':             'Öffne diese Seite in Chrome/Safari und füge sie zum Homescreen hinzu.',
    'settings.pwa.btn.install':      'Auf Homescreen hinzufügen',
    'settings.section.backup':       '💾 Backup & Restore',
    'settings.btn.backup':           '📦 Backup',
    'settings.btn.restore':          '♻️ Wiederherstellen',
    'settings.section.reminders':    '🔔 Erinnerungen',
    'settings.reminders.feed.label': 'Fütterungs-Erinnerung',
    'settings.reminders.sleep.label':'Schlaf-Warnung',
    'settings.reminders.hint':       'Benachrichtigungen müssen erlaubt sein.',
    'settings.reminders.off':        'Aus',
    'settings.reminders.2h':         'Alle 2 Stunden',
    'settings.reminders.3h':         'Alle 3 Stunden',
    'settings.reminders.4h':         'Alle 4 Stunden',
    'settings.reminders.after2h':    'Nach 2 Stunden',
    'settings.reminders.after3h':    'Nach 3 Stunden',
    'settings.reminders.after4h':    'Nach 4 Stunden',
    'settings.version':              'Baby Tracker v3.0',

    // Bottom nav
    'nav.home':                      'Start',
    'nav.tracker':                   'Tracker',
    'nav.stats':                     'Stats',
    'nav.verlauf':                   'Verlauf',
    'nav.more':                      'Mehr',

    // Mehr sheet
    'mehr.title':                    'Mehr',
    'mehr.wachstum':                 'Wachstum',
    'mehr.meilensteine':             'Meilensteine',
    'mehr.gesundheit':               'Gesundheit',
    'mehr.tagesplan':                'Tagesplan',
    'mehr.einstellungen':            'Einstellungen',

    // Header
    'header.theme.title':            'Theme wechseln',

    // Child switcher
    'child.switcher.title':          'Kind wechseln',
    'child.switcher.btn.add':        '+ Kind hinzufügen',

    // Modals — shared
    'modal.btn.cancel':              'Abbrechen',
    'modal.btn.save':                'Speichern',

    // Fix Sleep Start Modal
    'modal.fix.title':               '✏️ Schlafbeginn korrigieren',
    'modal.fix.day.today':           'Heute',
    'modal.fix.day.yesterday':       'Gestern',
    'modal.fix.time.label':          'Uhrzeit',

    // Add Child Modal
    'modal.child.title':             '👶 Kind hinzufügen',
    'modal.child.name.label':        'Name *',
    'modal.child.name.placeholder':  'z.B. Lena',
    'modal.child.gender.label':      'Geschlecht',
    'modal.child.gender.none':       'Keine Angabe',
    'modal.child.gender.female':     'Weiblich',
    'modal.child.gender.male':       'Männlich',
    'modal.child.gender.diverse':    'Divers',
    'modal.child.birthday.label':    'Geburtsdatum',
    'modal.child.btn.add':           'Hinzufügen',

    // Feed Modal
    'modal.feed.title':              '🍼 Fütterung eintragen',
    'modal.feed.type.label':         'Art',
    'modal.feed.amount.label':       'Menge (ml)',
    'modal.feed.amount.placeholder': 'z.B. 120',

    // Diaper Modal
    'modal.diaper.title':            '🧷 Windel eintragen',

    // Health Modal
    'modal.health.title':            'Messung eintragen',
    'modal.health.value.label':      'Wert',
    'modal.health.date.label':       'Datum',

    // Toast messages
    'toast.start_error':             'Startfehler — bitte Seite neu laden.',
    'toast.no_child':                'Bitte zuerst ein Kind anlegen.',
    'toast.woke_up':                 'Aufgewacht! Geschlafen: {{duration}}',
    'toast.sleeping':                'Schläft jetzt 😴',
    'toast.no_sleep':                'Kein laufender Schlaf.',
    'toast.sleep_fixed':             'Schlafbeginn korrigiert ✓',
    'toast.sleep_before_end':        'Schlafbeginn muss vor dem Schlafende liegen.',
    'toast.entry_not_found':         'Eintrag nicht gefunden.',
    'toast.health_saved':            'Messung gespeichert ✓',
    'toast.entry_deleted':           'Eintrag gelöscht',
    'toast.appt_fields':             'Bitte Titel und Datum angeben.',
    'toast.appt_saved':              'Termin gespeichert ✓',
    'toast.child_name_required':     'Bitte einen Namen eingeben.',
    'toast.child_added':             '{{name}} hinzugefügt ✓',
    'toast.active_child':            'Aktives Kind: {{name}}',
    'toast.backup_created':          'Backup erstellt ✓',
    'toast.json_invalid':            'Ungültiges JSON.',
    'toast.backup_invalid':          'Backup ungültig: {{reason}}',
    'toast.error':                   'Fehler: {{message}}',
    'toast.restore_running':         'Restore läuft…',
    'toast.restore_failed':          'Restore fehlgeschlagen — Daten unverändert.',
    'toast.no_snapshot':             'Kein Snapshot verfügbar.',
    'toast.csv_exported':            'CSV exportiert ✓',
    'toast.pwa_installed':           'App installiert ✓',
    'toast.notif_enabled':           'Benachrichtigungen aktiviert ✓',
    'toast.undo':                    'Rückgängig',
    'toast.restored':                'Wiederhergestellt ✓',
    'toast.feed_added':              '🍼 {{type}} eingetragen',
    'toast.diaper_added':            '🧷 {{kind}} eingetragen',
    'toast.theme.light':             '☀️ Light Mode',
    'toast.theme.dark':              '🌙 Dark Mode',

    // Restore confirm modal
    'restore.modal.title':           '♻️ Restore-Vorschau',
    'restore.modal.exported':        'Exportiert:',
    'restore.modal.unknown':         'Unbekannt',
    'restore.modal.children':        'Kinder:',
    'restore.modal.entries':         'Einträge:',
    'restore.modal.btn.overwrite':   'Überschreiben',
    'restore.modal.btn.merge':       'Zusammenführen',
    'restore.modal.btn.cancel':      'Abbrechen',

    // Snapshot confirm
    'confirm.snapshot':              'Zum letzten Snapshot zurückkehren?',

    // Log entry labels
    'log.sleep.start':               'Schlaf gestartet',
    'log.sleep.entry':               '💤 Schlaf',
    'log.feed.entry':                '🍼 Fütterung',
    'log.diaper.entry':              '🧷 Windel',
    'log.delete':                    'Löschen',
    'log.edit':                      'Bearbeiten',

    // Language setting
    'settings.section.language':     '🌍 Sprache',
    'settings.language.label':       'Sprache',
    'settings.language.de':          'Deutsch',
    'settings.language.en':          'English',
  },

  en: {
    // App shell
    'app.title':                     'Baby Tracker',
    'app.description':               'Baby Tracker – Sleep, Feeding, Diapers and more.',

    // Offline / update banners
    'banner.offline':                '⚡ Offline — Changes are saved and will sync later',
    'banner.update':                 '🔄 Update available',
    'banner.update.load':            'Load now',
    'banner.update.dismiss':         '✕',
    'banner.update.new':             'New version available!',
    'banner.update.refresh':         'Refresh',

    // Skip link
    'skip.link':                     'Skip to content',

    // Firebase loading overlay
    'fb.loading':                    'Connecting…',

    // Onboarding
    'ob.slide1.title':               'Welcome to Baby Tracker!',
    'ob.slide1.text':                "Keep track of your baby's sleep, feeding and more — even offline.",
    'ob.slide2.title':               'Track Sleep',
    'ob.slide2.text':                'Tap "Sleep" when the baby falls asleep — and again when they wake up. Corrections are always possible.',
    'ob.slide3.title':               'Statistics & History',
    'ob.slide3.text':                'See weekly summaries, bar charts and WHO growth curves.',
    'ob.slide4.title':               'Reminders & Backup',
    'ob.slide4.text':                'Get reminded about doctor appointments and back up your data with one tap.',
    'ob.btn.back':                   'Back',
    'ob.btn.next':                   'Next',

    // Notification banner
    'notif.banner.text':             '🔔 Enable notifications for appointment reminders',
    'notif.banner.enable':           'Enable',

    // Home page
    'page.home.title':               'Home',
    'home.section.today':            'Today',
    'home.empty':                    'No entries yet today 🌱',
    'home.btn.sleep':                '🌙 Sleep',
    'home.btn.sleep.active':         '😴 Woke up ({{time}})',
    'home.btn.feed':                 '🍼 Feeding',
    'home.btn.diaper':               '🧷 Diaper',
    'home.btn.fix':                  '✏️ Correct sleep start',

    // Tracker page
    'page.tracker.title':            'Tracker',
    'tracker.section.feed':          '🍼 Feeding',
    'tracker.section.diaper':        '🧷 Diaper',
    'tracker.section.recent':        'Recently added',
    'tracker.feed.placeholder':      'ml',
    'tracker.btn.add':               'Add',

    // Feed types
    'feed.type.breast':              'Breast',
    'feed.type.bottle':              'Bottle',
    'feed.type.solids':              'Solids',

    // Diaper types
    'diaper.type.wet':               'Wet',
    'diaper.type.dirty':             'Dirty',
    'diaper.type.both':              'Both',
    'diaper.type.dry':               'Dry',

    // Stats page
    'page.stats.title':              'Statistics',
    'stats.label.sleep':             'Sleep (7 d)',
    'stats.label.feed':              'Feedings (7 d)',
    'stats.label.diaper':            'Diapers (7 d)',
    'stats.chart.title':             'Sleep last 7 days',

    // Verlauf page
    'page.verlauf.title':            'History',
    'verlauf.filter.all':            'All',
    'verlauf.filter.sleep':          'Sleep',
    'verlauf.filter.feed':           'Feeding',
    'verlauf.filter.diaper':         'Diaper',
    'verlauf.empty':                 'No entries for this period.',
    'verlauf.loading':               'Loading entries…',
    'verlauf.btn.export':            '📥 Export CSV',

    // Growth page
    'page.wachstum.title':           'Growth',
    'growth.tab.weight':             'Weight',
    'growth.tab.height':             'Height',
    'growth.tab.head':               'Head circumference',
    'growth.percentile.current':     'Current: {{value}}',
    'growth.btn.weight':             '+ Add weight',
    'growth.btn.height':             '+ Add height',
    'growth.btn.head':               '+ Add head circumference',

    // Meilensteine page
    'page.meilensteine.title':       'Milestones',
    'milestones.loading':            'Loading milestones…',

    // Gesundheit page
    'page.gesundheit.title':         'Health',
    'health.section.weight':         '⚖️ Weight',
    'health.section.height':         '📏 Height',
    'health.section.appts':          '🏥 Appointments',
    'health.appt.placeholder.title': 'Appointment (e.g. 6-month check)',
    'health.appt.btn.add':           'Add',
    'health.weight.empty':           'No weight recorded yet.',
    'health.height.empty':           'No height recorded yet.',
    'health.appts.empty':            'No appointments.',
    'home.today.empty':              'No entries today.',

    // Tagesplan page
    'page.tagesplan.title':          'Daily Plan',
    'tagesplan.placeholder':         'Activity',
    'tagesplan.empty':               'No plan for today — add activities 📝',

    // Einstellungen page
    'page.einstellungen.title':      'Settings',
    'settings.section.children':     '👶 Children',
    'settings.btn.add_child':        '+ Add child',
    'settings.section.appearance':   '🎨 Appearance',
    'settings.btn.dark_mode':        '🌙 Dark Mode',
    'settings.btn.light_mode':       '☀️ Light Mode',
    'settings.section.pwa':          '📱 Install App',
    'settings.pwa.hint':             'Open this page in Chrome/Safari and add it to your home screen.',
    'settings.pwa.btn.install':      'Add to home screen',
    'settings.section.backup':       '💾 Backup & Restore',
    'settings.btn.backup':           '📦 Backup',
    'settings.btn.restore':          '♻️ Restore',
    'settings.section.reminders':    '🔔 Reminders',
    'settings.reminders.feed.label': 'Feeding reminder',
    'settings.reminders.sleep.label':'Sleep warning',
    'settings.reminders.hint':       'Notifications must be allowed.',
    'settings.reminders.off':        'Off',
    'settings.reminders.2h':         'Every 2 hours',
    'settings.reminders.3h':         'Every 3 hours',
    'settings.reminders.4h':         'Every 4 hours',
    'settings.reminders.after2h':    'After 2 hours',
    'settings.reminders.after3h':    'After 3 hours',
    'settings.reminders.after4h':    'After 4 hours',
    'settings.version':              'Baby Tracker v3.0',

    // Bottom nav
    'nav.home':                      'Home',
    'nav.tracker':                   'Tracker',
    'nav.stats':                     'Stats',
    'nav.verlauf':                   'History',
    'nav.more':                      'More',

    // Mehr sheet
    'mehr.title':                    'More',
    'mehr.wachstum':                 'Growth',
    'mehr.meilensteine':             'Milestones',
    'mehr.gesundheit':               'Health',
    'mehr.tagesplan':                'Daily Plan',
    'mehr.einstellungen':            'Settings',

    // Header
    'header.theme.title':            'Toggle theme',

    // Child switcher
    'child.switcher.title':          'Switch child',
    'child.switcher.btn.add':        '+ Add child',

    // Modals — shared
    'modal.btn.cancel':              'Cancel',
    'modal.btn.save':                'Save',

    // Fix Sleep Start Modal
    'modal.fix.title':               '✏️ Correct sleep start',
    'modal.fix.day.today':           'Today',
    'modal.fix.day.yesterday':       'Yesterday',
    'modal.fix.time.label':          'Time',

    // Add Child Modal
    'modal.child.title':             '👶 Add child',
    'modal.child.name.label':        'Name *',
    'modal.child.name.placeholder':  'e.g. Lena',
    'modal.child.gender.label':      'Gender',
    'modal.child.gender.none':       'Not specified',
    'modal.child.gender.female':     'Female',
    'modal.child.gender.male':       'Male',
    'modal.child.gender.diverse':    'Diverse',
    'modal.child.birthday.label':    'Date of birth',
    'modal.child.btn.add':           'Add',

    // Feed Modal
    'modal.feed.title':              '🍼 Log feeding',
    'modal.feed.type.label':         'Type',
    'modal.feed.amount.label':       'Amount (ml)',
    'modal.feed.amount.placeholder': 'e.g. 120',

    // Diaper Modal
    'modal.diaper.title':            '🧷 Log diaper',

    // Health Modal
    'modal.health.title':            'Add measurement',
    'modal.health.value.label':      'Value',
    'modal.health.date.label':       'Date',

    // Toast messages
    'toast.start_error':             'Startup error — please reload the page.',
    'toast.no_child':                'Please add a child first.',
    'toast.woke_up':                 'Woke up! Slept: {{duration}}',
    'toast.sleeping':                'Sleeping now 😴',
    'toast.no_sleep':                'No active sleep session.',
    'toast.sleep_fixed':             'Sleep start corrected ✓',
    'toast.sleep_before_end':        'Sleep start must be before sleep end.',
    'toast.entry_not_found':         'Entry not found.',
    'toast.health_saved':            'Measurement saved ✓',
    'toast.entry_deleted':           'Entry deleted',
    'toast.appt_fields':             'Please enter a title and date.',
    'toast.appt_saved':              'Appointment saved ✓',
    'toast.child_name_required':     'Please enter a name.',
    'toast.child_added':             '{{name}} added ✓',
    'toast.active_child':            'Active child: {{name}}',
    'toast.backup_created':          'Backup created ✓',
    'toast.json_invalid':            'Invalid JSON.',
    'toast.backup_invalid':          'Invalid backup: {{reason}}',
    'toast.error':                   'Error: {{message}}',
    'toast.restore_running':         'Restoring…',
    'toast.restore_failed':          'Restore failed — data unchanged.',
    'toast.no_snapshot':             'No snapshot available.',
    'toast.csv_exported':            'CSV exported ✓',
    'toast.pwa_installed':           'App installed ✓',
    'toast.notif_enabled':           'Notifications enabled ✓',
    'toast.undo':                    'Undo',
    'toast.restored':                'Restored ✓',
    'toast.feed_added':              '🍼 {{type}} logged',
    'toast.diaper_added':            '🧷 {{kind}} logged',
    'toast.theme.light':             '☀️ Light Mode',
    'toast.theme.dark':              '🌙 Dark Mode',

    // Restore confirm modal
    'restore.modal.title':           '♻️ Restore Preview',
    'restore.modal.exported':        'Exported:',
    'restore.modal.unknown':         'Unknown',
    'restore.modal.children':        'Children:',
    'restore.modal.entries':         'Entries:',
    'restore.modal.btn.overwrite':   'Overwrite',
    'restore.modal.btn.merge':       'Merge',
    'restore.modal.btn.cancel':      'Cancel',

    // Snapshot confirm
    'confirm.snapshot':              'Return to the last snapshot?',

    // Log entry labels
    'log.sleep.start':               'Sleep started',
    'log.sleep.entry':               '💤 Sleep',
    'log.feed.entry':                '🍼 Feeding',
    'log.diaper.entry':              '🧷 Diaper',
    'log.delete':                    'Delete',
    'log.edit':                      'Edit',

    // Language setting
    'settings.section.language':     '🌍 Language',
    'settings.language.label':       'Language',
    'settings.language.de':          'Deutsch',
    'settings.language.en':          'English',
  },
};

// ── Internal state ────────────────────────────────────────────────────────

const STORAGE_KEY = 'bt-lang';
const SUPPORTED   = ['de', 'en'];
const DEFAULT     = 'de';

let _lang = DEFAULT;

// ── Core API ──────────────────────────────────────────────────────────────

/**
 * Return the translation for `key` in the current language.
 * Falls back to DE, then to the bare key if not found anywhere.
 * Replaces {{placeholder}} tokens with values from `params`.
 *
 * @param {string} key
 * @param {Record<string,string|number>} [params]
 * @returns {string}
 */
export function t(key, params) {
  const dict     = TRANSLATIONS[_lang]   || TRANSLATIONS[DEFAULT];
  const fallback = TRANSLATIONS[DEFAULT];
  let str = Object.prototype.hasOwnProperty.call(dict, key)
    ? dict[key]
    : Object.prototype.hasOwnProperty.call(fallback, key)
      ? fallback[key]
      : key;

  if (params && typeof params === 'object') {
    str = str.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{{${k}}}`
    );
  }
  return str;
}

/**
 * Set the active language and persist to localStorage.
 * @param {'de'|'en'} lang
 */
export function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) {
    console.warn(`[i18n] Unsupported language: "${lang}". Keeping "${_lang}".`);
    return;
  }
  _lang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (_e) { /* quota / private */ }
}

/**
 * Return the currently active language code.
 * @returns {'de'|'en'}
 */
export function getLanguage() {
  return _lang;
}

/**
 * Walk the DOM subtree rooted at `root` and update elements that carry
 * data-i18n, data-i18n-placeholder, data-i18n-title, or data-i18n-aria-label.
 *
 * @param {Document|Element} [root=document]
 */
export function applyI18n(root = document) {
  // textContent
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });

  // placeholder attribute
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });

  // title attribute
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });

  // aria-label attribute
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) el.setAttribute('aria-label', t(key));
  });
}

// ── Initialise from storage on module load ────────────────────────────────

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED.includes(stored)) _lang = stored;
} catch (_e) { /* ignore */ }
