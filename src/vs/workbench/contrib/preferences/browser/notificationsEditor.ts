/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notificationsEditor';
import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { dispose, Disposable, IDisposable, combinedDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Checkbox, ICheckboxOpts } from 'vs/base/browser/ui/checkbox/checkbox';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CONTEXT_KEYBINDINGS_EDITOR } from 'vs/workbench/contrib/preferences/common/preferences';
import { IThemeService, registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { listHighlightForeground, listActiveSelectionForeground, listInactiveSelectionForeground, listHoverForeground, listFocusForeground, editorBackground, foreground, listActiveSelectionBackground, listInactiveSelectionBackground, listFocusBackground, listHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Emitter, Event } from 'vs/base/common/event';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { Color, RGBA } from 'vs/base/common/color';
import { WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { INotificationItemEntry, INotificationsEditorPane, IListEntry, IKeybindingItemEntry, INotificationItem } from 'vs/workbench/services/preferences/common/preferences';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IListRenderer, IListContextMenuEvent, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { NotificationsEditorModel } from 'vs/workbench/services/preferences/browser/notificationsEditorModel';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
export const NOTIFICATION_ENTRY_TEMPLATE_ID = 'notification.entry.template';

const $ = DOM.$;

interface ColumnItem {
	column: HTMLElement;
	proportion?: number;
	width: number;
}

const oddRowBackgroundColor = new Color(new RGBA(130, 130, 130, 0.04));

export class NotificationsEditor extends EditorPane implements INotificationsEditorPane {

	static readonly ID: string = 'workbench.editor.notifications';

	private _onLayout: Emitter<void> = this._register(new Emitter<void>());
	readonly onLayout: Event<void> = this._onLayout.event;

	private headerContainer!: HTMLElement;

	private overlayContainer!: HTMLElement;

	private columnItems: ColumnItem[] = [];
	private notificationListContainer!: HTMLElement;

	private listEntries: IListEntry[] = [];
	private notificationList!: WorkbenchList<IListEntry>;
	private notificationsEditorModel: NotificationsEditorModel | null = null;


	private dimension: DOM.Dimension | null = null;

	private notificationsEditorContextKey: IContextKey<boolean>;

	private ariaLabelElement!: HTMLElement;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		// @INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		// @IEditorService private readonly editorService: IEditorService,
		@IStorageService storageService: IStorageService
	) {
		super(NotificationsEditor.ID, telemetryService, themeService, storageService);
		this.notificationsEditorContextKey = CONTEXT_KEYBINDINGS_EDITOR.bindTo(this.contextKeyService);
		this.render(!!this.notificationsEditorContextKey.get());
	}
	onDefineWhenExpression!: Event<IKeybindingItemEntry>;
	search(filter: string): void {
		throw new Error('Method not implemented.');
	}
	focusSearch(): void {
		throw new Error('Method not implemented.');
	}
	clearSearchResults(): void {
		throw new Error('Method not implemented.');
	}
	showNotificationAgain(notificationEntry: INotificationItemEntry): void {
		throw new Error('Method not implemented.');
	}
	private async render(preserveFocus: boolean): Promise<void> {
		this.notificationsEditorModel = this.instantiationService.createInstance(NotificationsEditorModel);
		await this.notificationsEditorModel.resolve();
		this.renderNotificationEntries();
	}

	private renderNotificationEntries(): void {
		if (this.notificationsEditorModel) {
			const notificationItems: INotificationItem[] = this.notificationsEditorModel.notificationItems;
			this.ariaLabelElement.setAttribute('aria-label', localize('show notifications', "Showing {0} notifications", notificationItems.length));
			this.layoutNotificationsList();
		}
	}
	renderElement(notificationItem: INotificationItem, index: number, template: NotificationItemTemplate): void {
		template.parent.classList.toggle('odd', index % 2 === 1);
		for (const column of template.columns) {
			column.render(notificationItem);
		}
	}
	createEditor(parent: HTMLElement): void {
		const notificationsEditorElement = DOM.append(parent, $('div', { class: 'notifications-editor' }));

		this.createAriaLabelElement(notificationsEditorElement);
		this.createOverlayContainer(notificationsEditorElement);
		this.createHeader(notificationsEditorElement);
		this.createBody(notificationsEditorElement);
	}

	clearInput(): void {
		super.clearInput();
		this.notificationsEditorContextKey.reset();
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;

		this.overlayContainer.style.width = dimension.width + 'px';
		this.overlayContainer.style.height = dimension.height + 'px';

		this.columnItems.forEach(columnItem => {
			if (columnItem.proportion) {
				columnItem.width = 0;
			}
		});
		this.layoutNotificationsList();
		this._onLayout.fire();
	}

	layoutColumns(columns: HTMLElement[]): void {
		if (this.columnItems) {
			columns.forEach((column, index) => {
				column.style.paddingRight = `6px`;
				column.style.width = `${this.columnItems[index].width}px`;
			});
		}
	}

	focus(): void {
		const activeNotificationEntry = this.activeNotificationEntry;
		if (activeNotificationEntry) {
			this.selectEntry(activeNotificationEntry);
		} else {
			//this.searchWidget.focus();
		}
	}

	get activeNotificationEntry(): INotificationItemEntry | null {
		const focusedElement = this.notificationList.getFocusedElements()[0];
		return focusedElement && focusedElement.templateId === NOTIFICATION_ENTRY_TEMPLATE_ID ? <INotificationItemEntry>focusedElement : null;
	}

	private createAriaLabelElement(parent: HTMLElement): void {
		this.ariaLabelElement = DOM.append(parent, DOM.$(''));
		this.ariaLabelElement.setAttribute('id', 'notifications-editor-aria-label-element');
		this.ariaLabelElement.setAttribute('aria-live', 'assertive');
	}

	private createOverlayContainer(parent: HTMLElement): void {
		this.overlayContainer = DOM.append(parent, $('.overlay-container'));
		this.overlayContainer.style.position = 'absolute';
		this.overlayContainer.style.zIndex = '10';
		this.hideOverlayContainer();
	}

	private hideOverlayContainer() {
		this.overlayContainer.style.display = 'none';
	}

	private createHeader(parent: HTMLElement): void {
		this.headerContainer = DOM.append(parent, $('.notifications-header'));
	}

	private createBody(parent: HTMLElement): void {
		const bodyContainer = DOM.append(parent, $('.notifications-body'));
		this.createListHeader(bodyContainer);
		this.createList(bodyContainer);
	}

	private createListHeader(parent: HTMLElement): void {
		const notificationsListHeader = DOM.append(parent, $('.notifications-list-header'));
		notificationsListHeader.style.height = '30px';
		notificationsListHeader.style.lineHeight = '30px';

		this.columnItems = [];
		let column = $('.header.actions');
		this.columnItems.push({ column, width: 30 });

		column = $('.header.never-show-again', undefined, localize('never-show-again', "Never Show Again"));
		this.columnItems.push({ column, proportion: 0.25, width: 0 });

		column = $('.header.notification', undefined, localize('keybinding', "Notification"));
		this.columnItems.push({ column, proportion: 0.25, width: 0 });

		column = $('.header.when', undefined, localize('when', "When"));
		this.columnItems.push({ column, proportion: 0.5, width: 0 });

		DOM.append(notificationsListHeader, ...this.columnItems.map(({ column }) => column));
	}

	private createList(parent: HTMLElement): void {
		this.notificationListContainer = DOM.append(parent, $('.notifications-list-container'));
		this.notificationList = this._register(this.instantiationService.createInstance(WorkbenchList, 'NotificationsEditor', this.notificationListContainer, new Delegate(), [new NotificationItemRenderer(this, this.instantiationService)], {
			identityProvider: { getId: (e: IListEntry) => e.id },
			setRowLineHeight: false,
			horizontalScrolling: false,
			accessibilityProvider: new AccessibilityProvider(),
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: INotificationItemEntry) => e.notificationItem.label },
			overrideStyles: {
				listBackground: editorBackground
			}
		})) as WorkbenchList<IListEntry>;

		this._register(this.notificationList.onContextMenu(e => this.onContextMenu(e)));
		this._register(this.notificationList.onDidFocus(() => {
			this.notificationList.getHTMLElement().classList.add('focused');
		}));
	}

	private layoutNotificationsList(): void {
		if (!this.dimension) {
			return;
		}
		let width = this.dimension.width - 27;
		for (const columnItem of this.columnItems) {
			if (columnItem.width && !columnItem.proportion) {
				width = width - columnItem.width;
			}
		}
		for (const columnItem of this.columnItems) {
			if (columnItem.proportion && !columnItem.width) {
				columnItem.width = width * columnItem.proportion;
			}
		}

		this.layoutColumns(this.columnItems.map(({ column }) => column));
		const listHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12 /*padding*/ + 30 /*list header*/);
		this.notificationListContainer.style.height = `${listHeight}px`;
		this.notificationList.layout(listHeight);
	}

	private getIndexOf(listEntry: IListEntry): number {
		const index = this.listEntries.indexOf(listEntry);
		if (index === -1) {
			for (let i = 0; i < this.listEntries.length; i++) {
				if (this.listEntries[i].id === listEntry.id) {
					return i;
				}
			}
		}
		return index;
	}

	private selectEntry(entry: INotificationItemEntry | number, focus: boolean = true): void {
		const index = typeof entry === 'number' ? entry : this.getIndexOf(entry);
		if (index !== -1) {
			if (focus) {
				this.notificationList.getHTMLElement().focus();
				this.notificationList.setFocus([index]);
			}
			this.notificationList.setSelection([index]);
		}
	}

	focusNotifications(): void {
		this.notificationList.getHTMLElement().focus();
		const currentFocusIndices = this.notificationList.getFocus();
		this.notificationList.setFocus([currentFocusIndices.length ? currentFocusIndices[0] : 0]);
	}

	selectNotification(entry: INotificationItemEntry): void {
		this.selectEntry(entry);
	}


	private onContextMenu(e: IListContextMenuEvent<IListEntry>): void {
		if (!e.element) {
			return;
		}

		if (e.element.templateId === NOTIFICATION_ENTRY_TEMPLATE_ID) {
			const entry = <INotificationItemEntry>e.element;
			this.selectEntry(entry);
		}
	}
}

class Delegate implements IListVirtualDelegate<IListEntry> {

	getHeight(element: IListEntry) {
		return 24;
	}

	getTemplateId(element: IListEntry) {
		return element.templateId;
	}
}

interface NotificationItemTemplate {
	parent: HTMLElement;
	columns: Column[];
	disposable: IDisposable;
}

class NotificationItemRenderer implements IListRenderer<INotificationItemEntry, NotificationItemTemplate> {

	get templateId(): string { return NOTIFICATION_ENTRY_TEMPLATE_ID; }

	constructor(
		private notificationsEditor: NotificationsEditor,
		private instantiationService: IInstantiationService
	) {

	}


	renderTemplate(parent: HTMLElement): NotificationItemTemplate {
		parent.classList.add('notification-item');

		const neverShowAgain: NeverShowAgainColumn = this.instantiationService.createInstance(NeverShowAgainColumn, parent, this.notificationsEditor);
		const label: LabelColumn = this.instantiationService.createInstance(LabelColumn, parent, this.notificationsEditor);
		const when: WhenColumn = this.instantiationService.createInstance(WhenColumn, parent, this.notificationsEditor);

		const columns: Column[] = [neverShowAgain, label, when];
		const disposables = combinedDisposable(...columns);
		const elements = columns.map(({ element }) => element);

		this.notificationsEditor.layoutColumns(elements);
		this.notificationsEditor.onLayout(() => this.notificationsEditor.layoutColumns(elements));

		return {
			parent,
			columns,
			disposable: disposables
		};
	}

	renderElement(notificationEntry: INotificationItemEntry, index: number, template: NotificationItemTemplate): void {
		template.parent.classList.toggle('odd', index % 2 === 1);
		for (const column of template.columns) {
			column.render(notificationEntry.notificationItem);
		}
	}

	disposeTemplate(template: NotificationItemTemplate): void {
		template.disposable.dispose();
	}
}

abstract class Column extends Disposable {
	static COUNTER = 0;

	abstract readonly element: HTMLElement;
	abstract render(entry: INotificationItem): void;

	constructor(protected notificationsEditor: INotificationsEditorPane) {
		super();
	}
}

class NeverShowAgainColumn extends Column {

	private readonly checkbox: Checkbox;
	readonly element: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		notificationsEditor: INotificationsEditorPane,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: InstantiationService
	) {
		super(notificationsEditor);
		this.element = DOM.append(parent, $('.column.neverShowAgain', { id: 'neverShowAgain_' + ++Column.COUNTER }));
		const opts: ICheckboxOpts = { title: 'Never Show Again', isChecked: true };
		this.checkbox = this.instantiationService.createInstance(Checkbox, opts);
		this._register(attachInputBoxStyler(this.checkbox, this.themeService));
	}

	render(notificationItem: INotificationItem): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.element);
		DOM.append(this.element);
	}

	dispose(): void {
		super.dispose();
		dispose(this.checkbox);
	}
}

class LabelColumn extends Column {

	private readonly label: HTMLElement;
	readonly element: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		notificationsEditor: INotificationsEditorPane,
	) {
		super(notificationsEditor);
		this.element = DOM.append(parent, $('.column.label', { id: 'notification_' + ++Column.COUNTER }));
		this.label = DOM.append(this.element, $('div.label-label'));
	}

	render(notificationItem: INotificationItem): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.label);
		this.label.classList.toggle('code', !notificationItem.when);
		const whenLabel = new HighlightedLabel(this.label, false);
		whenLabel.set(notificationItem.when);
		this.element.title = notificationItem.when;
		whenLabel.element.title = notificationItem.when;
	}
}

class WhenColumn extends Column {

	private readonly whenLabel: HTMLElement;
	readonly element: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		notificationsEditor: INotificationsEditorPane,
	) {
		super(notificationsEditor);
		this.element = DOM.append(parent, $('.column.when', { id: 'notification_' + ++Column.COUNTER }));
		this.whenLabel = DOM.append(this.element, $('div.when-label'));
	}

	render(notificationItem: INotificationItem): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.whenLabel);
		this.whenLabel.classList.toggle('code', !notificationItem.when);
		const whenLabel = new HighlightedLabel(this.whenLabel, false);
		whenLabel.set(notificationItem.when);
		this.element.title = notificationItem.when;
		whenLabel.element.title = notificationItem.when;
	}
}

class AccessibilityProvider implements IListAccessibilityProvider<INotificationItemEntry> {

	getWidgetAriaLabel(): string {
		return localize('notificationsLabel', "Notifications");
	}

	getAriaLabel(entry: INotificationItemEntry): string {
		let ariaLabel = entry.notificationItem.neverShowAgain
			+ ', ' + entry.notificationItem.label
			+ ', ' + entry.notificationItem.when;
		return ariaLabel;
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-header { background-color: ${oddRowBackgroundColor}; }`);
	collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list-row.odd:not(.focused):not(.selected):not(:hover) { background-color: ${oddRowBackgroundColor}; }`);
	collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:not(:focus) .monaco-list-row.focused.odd:not(.selected):not(:hover) { background-color: ${oddRowBackgroundColor}; }`);
	collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:not(.focused) .monaco-list-row.focused.odd:not(.selected):not(:hover) { background-color: ${oddRowBackgroundColor}; }`);

	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		const whenForegroundColor = foregroundColor.transparent(.8).makeOpaque(WORKBENCH_BACKGROUND(theme));
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list-row > .column > .code { color: ${whenForegroundColor}; }`);
		const whenForegroundColorForOddRow = foregroundColor.transparent(.8).makeOpaque(oddRowBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list-row.odd > .column > .code { color: ${whenForegroundColorForOddRow}; }`);
	}

	const listActiveSelectionForegroundColor = theme.getColor(listActiveSelectionForeground);
	const listActiveSelectionBackgroundColor = theme.getColor(listActiveSelectionBackground);
	if (listActiveSelectionForegroundColor && listActiveSelectionBackgroundColor) {
		const whenForegroundColor = listActiveSelectionForegroundColor.transparent(.8).makeOpaque(listActiveSelectionBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.selected > .column > .code { color: ${whenForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.odd.selected > .column > .code { color: ${whenForegroundColor}; }`);
	}

	const listInactiveSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
	const listInactiveSelectionBackgroundColor = theme.getColor(listInactiveSelectionBackground);
	if (listInactiveSelectionForegroundColor && listInactiveSelectionBackgroundColor) {
		const whenForegroundColor = listInactiveSelectionForegroundColor.transparent(.8).makeOpaque(listInactiveSelectionBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row.selected > .column > .code { color: ${whenForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row.odd.selected > .column > .code { color: ${whenForegroundColor}; }`);
	}

	const listFocusForegroundColor = theme.getColor(listFocusForeground);
	const listFocusBackgroundColor = theme.getColor(listFocusBackground);
	if (listFocusForegroundColor && listFocusBackgroundColor) {
		const whenForegroundColor = listFocusForegroundColor.transparent(.8).makeOpaque(listFocusBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.focused > .column > .code { color: ${whenForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.odd.focused > .column > .code { color: ${whenForegroundColor}; }`);
	}

	const listHoverForegroundColor = theme.getColor(listHoverForeground);
	const listHoverBackgroundColor = theme.getColor(listHoverBackground);
	if (listHoverForegroundColor && listHoverBackgroundColor) {
		const whenForegroundColor = listHoverForegroundColor.transparent(.8).makeOpaque(listHoverBackgroundColor);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row:hover:not(.focused):not(.selected) > .column > .code { color: ${whenForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.odd:hover:not(.focused):not(.selected) > .column > .code { color: ${whenForegroundColor}; }`);
	}

	const listHighlightForegroundColor = theme.getColor(listHighlightForeground);
	if (listHighlightForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list-row > .column .highlight { color: ${listHighlightForegroundColor}; }`);
	}

	if (listActiveSelectionForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.selected.focused > .column .monaco-keybinding-key { color: ${listActiveSelectionForegroundColor}; }`);
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list:focus .monaco-list-row.selected > .column .monaco-keybinding-key { color: ${listActiveSelectionForegroundColor}; }`);
	}
	const listInactiveFocusAndSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
	if (listInactiveFocusAndSelectionForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row.selected > .column .monaco-keybinding-key { color: ${listInactiveFocusAndSelectionForegroundColor}; }`);
	}
	if (listHoverForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row:hover:not(.selected):not(.focused) > .column .monaco-keybinding-key { color: ${listHoverForegroundColor}; }`);
	}
	if (listFocusForegroundColor) {
		collector.addRule(`.notifications-editor > .notifications-body > .notifications-list-container .monaco-list .monaco-list-row.focused > .column .monaco-keybinding-key { color: ${listFocusForegroundColor}; }`);
	}
});