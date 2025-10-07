import { App, ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, setIcon } from 'obsidian';

// Data structures
interface Habit {
	id: string;
	name: string;
	icon: string; // lucide icon name
	color: string; // hex color
}

interface HabitEntry {
	habitId: string;
	date: string; // YYYY-MM-DD format
}

interface HabitTrackerSettings {
	habits: Habit[];
	entries: HabitEntry[];
}

const DEFAULT_SETTINGS: HabitTrackerSettings = {
	habits: [],
	entries: []
}

const VIEW_TYPE_HABIT_CALENDAR = 'habit-calendar-view';

// Common lucide icon suggestions
const SUGGESTED_ICONS = [
	'check-circle', 'heart', 'star', 'sun', 'moon', 'coffee', 'book',
	'dumbbell', 'apple', 'droplet', 'zap', 'music', 'camera', 'pen-tool',
	'activity', 'target', 'trending-up', 'smile', 'brain', 'leaf'
];

export default class HabitTrackerPlugin extends Plugin {
	settings: HabitTrackerSettings;

	async onload() {
		await this.loadSettings();

		// Register the calendar view
		this.registerView(
			VIEW_TYPE_HABIT_CALENDAR,
			(leaf) => new HabitCalendarView(leaf, this)
		);

		// Add ribbon icon to open calendar
		this.addRibbonIcon('calendar-check', 'Open Habit Tracker', () => {
			this.activateView();
		});

		// Add command to open calendar
		this.addCommand({
			id: 'open-habit-tracker',
			name: 'Open Habit Tracker',
			callback: () => {
				this.activateView();
			}
		});

		// Add settings tab
		this.addSettingTab(new HabitTrackerSettingTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_HABIT_CALENDAR);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Create a new leaf in the main area
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE_HABIT_CALENDAR, active: true });
		}

		// Reveal the leaf
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_HABIT_CALENDAR);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class HabitCalendarView extends ItemView {
	plugin: HabitTrackerPlugin;
	currentDate: Date;

	constructor(leaf: WorkspaceLeaf, plugin: HabitTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = new Date();
	}

	getViewType(): string {
		return VIEW_TYPE_HABIT_CALENDAR;
	}

	getDisplayText(): string {
		return 'Habit Tracker';
	}

	getIcon(): string {
		return 'calendar-check';
	}

	async onOpen() {
		this.renderView();
	}

	async onClose() {
		// Nothing to clean up
	}

	renderView() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('habit-tracker-view');

		// Header with month navigation
		const header = container.createDiv({ cls: 'habit-tracker-header' });

		const prevBtn = header.createEl('button', { text: '◀', cls: 'habit-nav-btn' });
		prevBtn.addEventListener('click', () => {
			this.currentDate.setMonth(this.currentDate.getMonth() - 1);
			this.renderView();
		});

		const monthYear = header.createEl('h2', {
			text: this.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
			cls: 'habit-month-year'
		});

		const nextBtn = header.createEl('button', { text: '▶', cls: 'habit-nav-btn' });
		nextBtn.addEventListener('click', () => {
			this.currentDate.setMonth(this.currentDate.getMonth() + 1);
			this.renderView();
		});

		const todayBtn = header.createEl('button', { text: 'Today', cls: 'habit-today-btn' });
		todayBtn.addEventListener('click', () => {
			this.currentDate = new Date();
			this.renderView();
		});

		const summaryBtn = header.createEl('button', { text: 'Summary', cls: 'habit-summary-btn' });
		summaryBtn.addEventListener('click', () => {
			new MonthlySummaryModal(this.app, this.plugin, this.currentDate).open();
		});

		// Calendar grid
		const calendarSection = container.createDiv({ cls: 'habit-tracker-calendar' });
		this.renderCalendar(calendarSection);

		// Empty state if no habits
		if (this.plugin.settings.habits.length === 0) {
			const emptyState = container.createDiv({ cls: 'habit-empty-state' });
			emptyState.createEl('p', { text: 'No habits configured yet.' });
			emptyState.createEl('p', { text: 'Go to Settings → The Good Tracker to add your first habit!' });
		}
	}

	renderCalendar(container: HTMLElement) {
		const year = this.currentDate.getFullYear();
		const month = this.currentDate.getMonth();

		// Get first day of month and number of days
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const daysInMonth = lastDay.getDate();
		const startingDayOfWeek = firstDay.getDay();

		// Calendar header with day names
		const calendarGrid = container.createDiv({ cls: 'calendar-grid' });
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		dayNames.forEach(day => {
			calendarGrid.createDiv({ text: day, cls: 'calendar-day-name' });
		});

		// Empty cells before first day
		for (let i = 0; i < startingDayOfWeek; i++) {
			calendarGrid.createDiv({ cls: 'calendar-day empty' });
		}

		// Days of the month
		const today = new Date();
		for (let day = 1; day <= daysInMonth; day++) {
			const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
			const dayCell = calendarGrid.createDiv({ cls: 'calendar-day' });

			// Check if this is today
			if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
				dayCell.addClass('today');
			}

			const dayNumber = dayCell.createDiv({ text: String(day), cls: 'day-number' });

			// Show habits for this day
			const dayHabits = dayCell.createDiv({ cls: 'day-habits' });
			const entriesForDay = this.plugin.settings.entries.filter(e => e.date === dateStr);

			entriesForDay.forEach(entry => {
				const habit = this.plugin.settings.habits.find(h => h.id === entry.habitId);
				if (habit) {
					const habitIcon = dayHabits.createDiv({ cls: 'day-habit-icon' });
					habitIcon.style.color = habit.color;
					setIcon(habitIcon, habit.icon);
					habitIcon.setAttribute('title', habit.name);
				}
			});

			// Click to add habit
			dayCell.addEventListener('click', () => {
				if (this.plugin.settings.habits.length > 0) {
					new HabitPickerModal(this.app, this.plugin, dateStr, () => {
						this.renderView();
					}).open();
				} else {
					new Notice('Add some habits in settings first!');
				}
			});
		}
	}
}

class HabitPickerModal extends Modal {
	plugin: HabitTrackerPlugin;
	dateStr: string;
	onUpdate: () => void;

	constructor(app: App, plugin: HabitTrackerPlugin, dateStr: string, onUpdate: () => void) {
		super(app);
		this.plugin = plugin;
		this.dateStr = dateStr;
		this.onUpdate = onUpdate;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('habit-picker-modal');

		contentEl.createEl('h3', { text: `Track habits for ${this.dateStr}` });

		const existingEntries = this.plugin.settings.entries.filter(e => e.date === this.dateStr);

		this.plugin.settings.habits.forEach(habit => {
			const habitDiv = contentEl.createDiv({ cls: 'habit-picker-item' });

			const checkbox = habitDiv.createEl('input', { type: 'checkbox' });
			checkbox.checked = existingEntries.some(e => e.habitId === habit.id);

			const label = habitDiv.createDiv({ cls: 'habit-picker-label' });
			const iconEl = label.createSpan({ cls: 'habit-icon' });
			iconEl.style.color = habit.color;
			setIcon(iconEl, habit.icon);
			label.createSpan({ text: habit.name, cls: 'habit-name' });

			checkbox.addEventListener('change', async () => {
				if (checkbox.checked) {
					// Add entry
					this.plugin.settings.entries.push({
						habitId: habit.id,
						date: this.dateStr
					});
				} else {
					// Remove entry
					this.plugin.settings.entries = this.plugin.settings.entries.filter(
						e => !(e.habitId === habit.id && e.date === this.dateStr)
					);
				}
				await this.plugin.saveSettings();
				this.onUpdate();
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class MonthlySummaryModal extends Modal {
	plugin: HabitTrackerPlugin;
	currentDate: Date;

	constructor(app: App, plugin: HabitTrackerPlugin, currentDate: Date) {
		super(app);
		this.plugin = plugin;
		this.currentDate = currentDate;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('habit-summary-modal');

		const monthYear = this.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
		contentEl.createEl('h2', { text: `Summary for ${monthYear}` });
		

		const year = this.currentDate.getFullYear();
		const month = this.currentDate.getMonth();
		const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
		const lastDay = new Date(year, month + 1, 0).getDate();
		const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

		if (this.plugin.settings.habits.length === 0) {
			contentEl.createEl('p', { text: 'No habits to show.' });
			return;
		}

		const summaryList = contentEl.createDiv({ cls: 'habit-summary-list' });

		this.plugin.settings.habits.forEach(habit => {
			const count = this.plugin.settings.entries.filter(e =>
				e.habitId === habit.id &&
				e.date >= monthStart &&
				e.date <= monthEnd
			).length;

			const summaryItem = summaryList.createDiv({ cls: 'habit-summary-item' });

			const iconEl = summaryItem.createSpan({ cls: 'habit-icon' });
			iconEl.style.color = habit.color;
			setIcon(iconEl, habit.icon);

			summaryItem.createSpan({ text: habit.name, cls: 'habit-name' });
			summaryItem.createSpan({ text: `${count} days`, cls: 'habit-count' });
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class HabitTrackerSettingTab extends PluginSettingTab {
	plugin: HabitTrackerPlugin;

	constructor(app: App, plugin: HabitTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'The Good Tracker Settings' });

		// Add habit button
		new Setting(containerEl)
			.setName('Add new habit')
			.setDesc('Create a new habit to track')
			.addButton(button => button
				.setButtonText('Add Habit')
				.setCta()
				.onClick(() => {
					new AddHabitModal(this.app, this.plugin, null, () => {
						this.display();
					}).open();
				}));

		// List existing habits
		containerEl.createEl('h3', { text: 'Your Habits' });

		if (this.plugin.settings.habits.length === 0) {
			containerEl.createEl('p', { text: 'No habits yet. Add one above!' });
		}

		this.plugin.settings.habits.forEach((habit, index) => {
			const setting = new Setting(containerEl)
				.setName(habit.name)
				.addButton(button => button
					.setButtonText('Edit')
					.onClick(() => {
						new AddHabitModal(this.app, this.plugin, habit, () => {
							this.display();
						}).open();
					}))
				.addButton(button => button
					.setButtonText('Delete')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.habits.splice(index, 1);
						// Also remove all entries for this habit
						this.plugin.settings.entries = this.plugin.settings.entries.filter(
							e => e.habitId !== habit.id
						);
						await this.plugin.saveSettings();
						this.display();
						new Notice(`Deleted habit: ${habit.name}`);
					}));

			// Show icon preview
			const iconPreview = setting.nameEl.createSpan({ cls: 'habit-icon-preview' });
			iconPreview.style.color = habit.color;
			iconPreview.style.marginRight = '8px';
			setIcon(iconPreview, habit.icon);
			setting.nameEl.insertBefore(iconPreview, setting.nameEl.firstChild);
		});
	}
}

class AddHabitModal extends Modal {
	plugin: HabitTrackerPlugin;
	habit: Habit | null;
	onUpdate: () => void;
	nameInput: HTMLInputElement;
	iconInput: HTMLInputElement;
	colorInput: HTMLInputElement;
	iconPreview: HTMLElement;

	constructor(app: App, plugin: HabitTrackerPlugin, habit: Habit | null, onUpdate: () => void) {
		super(app);
		this.plugin = plugin;
		this.habit = habit;
		this.onUpdate = onUpdate;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('add-habit-modal');

		contentEl.createEl('h2', { text: this.habit ? 'Edit Habit' : 'Add New Habit' });

		// Name input
		new Setting(contentEl)
			.setName('Habit name')
			.setDesc('What do you want to track?')
			.addText(text => {
				this.nameInput = text.inputEl;
				text.setPlaceholder('e.g., Exercise, Read, Meditate');
				if (this.habit) {
					text.setValue(this.habit.name);
				}
			});

		// Icon input with preview
		const iconSetting = new Setting(contentEl)
			.setName('Icon')
			.setDesc('Enter a Lucide icon name')
			.addText(text => {
				this.iconInput = text.inputEl;
				text.setPlaceholder('e.g., dumbbell, book, heart');
				if (this.habit) {
					text.setValue(this.habit.icon);
				}
				text.inputEl.addEventListener('input', () => {
					this.updateIconPreview();
				});
			});

		// Icon preview
		this.iconPreview = iconSetting.controlEl.createDiv({ cls: 'icon-preview' });
		if (this.habit) {
			setIcon(this.iconPreview, this.habit.icon);
		}

		// Suggested icons
		const suggestedDiv = contentEl.createDiv({ cls: 'suggested-icons' });
		suggestedDiv.createEl('p', { text: 'Suggested icons:', cls: 'setting-item-description' });
		const iconsGrid = suggestedDiv.createDiv({ cls: 'icons-grid' });
		SUGGESTED_ICONS.forEach(iconName => {
			const iconBtn = iconsGrid.createDiv({ cls: 'icon-suggestion' });
			setIcon(iconBtn, iconName);
			iconBtn.setAttribute('title', iconName);
			iconBtn.addEventListener('click', () => {
				this.iconInput.value = iconName;
				this.updateIconPreview();
			});
		});

		// Color input
		const colorSetting = new Setting(contentEl)
			.setName('Color')
			.setDesc('Choose a color for this habit')
			.addColorPicker(color => {
				color.setValue(this.habit ? this.habit.color : '#6366f1');
				color.onChange((value) => {
					this.updateIconPreview();
				});
			});

		// Get color input element
		this.colorInput = colorSetting.controlEl.querySelector('input[type="color"]') as HTMLInputElement;

		// Buttons
		const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });

		const saveButton = buttonDiv.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveButton.addEventListener('click', async () => {
			const name = this.nameInput.value.trim();
			const icon = this.iconInput.value.trim();
			const color = this.colorInput.value;

			if (!name) {
				new Notice('Please enter a habit name');
				return;
			}

			if (!icon) {
				new Notice('Please enter an icon name');
				return;
			}

			if (this.habit) {
				// Edit existing habit
				this.habit.name = name;
				this.habit.icon = icon;
				this.habit.color = color;
			} else {
				// Add new habit
				const newHabit: Habit = {
					id: Date.now().toString(),
					name: name,
					icon: icon,
					color: color
				};
				this.plugin.settings.habits.push(newHabit);
			}

			await this.plugin.saveSettings();
			new Notice(`${this.habit ? 'Updated' : 'Added'} habit: ${name}`);
			this.close();
			this.onUpdate();
		});

		const cancelButton = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => {
			this.close();
		});
	}

	updateIconPreview() {
		this.iconPreview.empty();
		const iconName = this.iconInput.value.trim();
		if (iconName) {
			setIcon(this.iconPreview, iconName);
			this.iconPreview.style.color = this.colorInput.value;
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
