<script lang="ts">
  import { onMount } from "svelte";
  import type { App } from "obsidian";
  import { FileSuggestModal } from "../modals/FileSuggestModal";
  import type { DashboardData, DashboardCard } from "./types";
  import {
    loadDashboard,
    saveDashboard,
    addCard,
    updateCard,
    deleteCard,
    addLink,
    deleteLink,
  } from "./storage";

  export let appInstance: App;

  let data: DashboardData = { cards: [] };
  let editingCard: DashboardCard | null = null;
  let editingCardTitle = "";
  let editingCardIcon = "";
  let showCardModal = false;

  let addingLinkToCardId: string | null = null;
  let newLinkLabel = "";
  let newLinkPath = "";
  let showLinkModal = false;

  let showAddCardModal = false;
  let newCardTitle = "";
  let newCardIcon = "📁";

  onMount(async () => {
    data = await loadDashboard(appInstance);
  });

  function openEditCard(card: DashboardCard) {
    editingCard = card;
    editingCardTitle = card.title;
    editingCardIcon = card.icon;
    showCardModal = true;
  }

  async function saveCardEdit() {
    if (!editingCard) return;
    await updateCard(appInstance, editingCard.id, {
      title: editingCardTitle,
      icon: editingCardIcon,
    });
    data = await loadDashboard(appInstance);
    showCardModal = false;
    editingCard = null;
  }

  async function removeCard(cardId: string) {
    await deleteCard(appInstance, cardId);
    data = await loadDashboard(appInstance);
  }

  function openAddLink(cardId: string) {
    addingLinkToCardId = cardId;
    newLinkLabel = "";
    newLinkPath = "";
    showLinkModal = true;
  }

  async function saveNewLink() {
    if (!addingLinkToCardId || !newLinkLabel) return;
    await addLink(appInstance, addingLinkToCardId, newLinkLabel, newLinkPath);
    data = await loadDashboard(appInstance);
    showLinkModal = false;
    addingLinkToCardId = null;
  }

  async function removeLink(cardId: string, linkId: string) {
    await deleteLink(appInstance, cardId, linkId);
    data = await loadDashboard(appInstance);
  }

  async function createNewCard() {
    if (!newCardTitle) return;
    await addCard(appInstance, newCardTitle, newCardIcon);
    data = await loadDashboard(appInstance);
    showAddCardModal = false;
    newCardTitle = "";
    newCardIcon = "📁";
  }

  function openFilePicker() {
    new FileSuggestModal(appInstance, (filePath) => {
      newLinkPath = filePath;
      // Auto-fill label from filename if empty
      if (!newLinkLabel) {
        const parts = filePath.split("/");
        const name = parts[parts.length - 1].replace(/\.md$/, "");
        newLinkLabel = name;
      }
    }).open();
  }

  function handleLinkClick(e: MouseEvent, notePath: string) {
    e.preventDefault();
    if (notePath) {
      appInstance.workspace.openLinkText(notePath, "", true);
    }
  }

  function closeModal(e: MouseEvent, closeFn: () => void) {
    if ((e.target as HTMLElement).classList.contains("dash-modal-overlay")) {
      closeFn();
    }
  }
</script>

<div class="dashboard">
  <div class="dashboard__grid">
    {#each data.cards as card, i (card.id)}
      <div class="dashboard-card" style="--card-index: {i}">
        <div class="dashboard-card__header">
          <h3 class="dashboard-card__title">
            <span>{card.icon} {card.title}</span>
          </h3>
          <div class="dashboard-card__actions">
            <button
              class="dash-btn dash-btn--icon"
              title="Добавить ссылку"
              on:click={() => openAddLink(card.id)}
            >+</button>
            <button
              class="dash-btn dash-btn--icon"
              title="Редактировать карточку"
              on:click={() => openEditCard(card)}
            >✎</button>
            <button
              class="dash-btn dash-btn--icon dash-btn--danger"
              title="Удалить карточку"
              on:click={() => removeCard(card.id)}
            >✕</button>
          </div>
        </div>
        <div class="dashboard-card__links">
          {#each card.links as link (link.id)}
            <a
              href={link.notePath}
              class="internal-link dashboard-card__item"
              on:click={(e) => handleLinkClick(e, link.notePath)}
            >
              <span class="dash-link-label">{link.label}</span>
              <button
                class="dash-btn dash-btn--sm dash-btn--danger"
                title="Удалить ссылку"
                on:click|stopPropagation={() => removeLink(card.id, link.id)}
              >✕</button>
            </a>
          {/each}
          {#if card.links.length === 0}
            <div class="dashboard-card__empty">Нет ссылок</div>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Add card button -->
    <button class="dashboard-card dashboard-card--add" on:click={() => { showAddCardModal = true; newCardTitle = ""; newCardIcon = "📁"; }}>
      <span class="dashboard-card__add-icon">+</span>
      <span class="dashboard-card__add-text">Добавить карточку</span>
    </button>
  </div>
</div>

<!-- Edit card modal -->
{#if showCardModal}
  <div class="dash-modal-overlay" on:click={(e) => closeModal(e, () => { showCardModal = false; editingCard = null; })}>
    <div class="dash-modal">
      <h3 class="dash-modal__title">Редактировать карточку</h3>
      <label class="dash-modal__label">
        Иконка
        <input class="dash-modal__input" type="text" bind:value={editingCardIcon} maxlength="4" />
      </label>
      <label class="dash-modal__label">
        Название
        <input class="dash-modal__input" type="text" bind:value={editingCardTitle} placeholder="Название карточки" />
      </label>
      <div class="dash-modal__actions">
        <button class="dash-btn dash-btn--cancel" on:click={() => { showCardModal = false; editingCard = null; }}>Отмена</button>
        <button class="dash-btn dash-btn--save" on:click={saveCardEdit}>Сохранить</button>
      </div>
    </div>
  </div>
{/if}

<!-- Add link modal -->
{#if showLinkModal}
  <div class="dash-modal-overlay" on:click={(e) => closeModal(e, () => { showLinkModal = false; addingLinkToCardId = null; })}>
    <div class="dash-modal">
      <h3 class="dash-modal__title">Добавить ссылку</h3>
      <label class="dash-modal__label">
        Название
        <input class="dash-modal__input" type="text" bind:value={newLinkLabel} placeholder="Название ссылки" />
      </label>
      <label class="dash-modal__label">
        Путь к заметке
        <div class="dash-modal__input-row">
          <input class="dash-modal__input" type="text" bind:value={newLinkPath} placeholder="Папка/Заметка" />
          <button class="dash-btn dash-btn--browse" title="Выбрать заметку" on:click={openFilePicker}>...</button>
        </div>
      </label>
      <div class="dash-modal__actions">
        <button class="dash-btn dash-btn--cancel" on:click={() => { showLinkModal = false; addingLinkToCardId = null; }}>Отмена</button>
        <button class="dash-btn dash-btn--save" on:click={saveNewLink}>Добавить</button>
      </div>
    </div>
  </div>
{/if}

<!-- Add card modal -->
{#if showAddCardModal}
  <div class="dash-modal-overlay" on:click={(e) => closeModal(e, () => { showAddCardModal = false; })}>
    <div class="dash-modal">
      <h3 class="dash-modal__title">Новая карточка</h3>
      <label class="dash-modal__label">
        Иконка
        <input class="dash-modal__input" type="text" bind:value={newCardIcon} maxlength="4" />
      </label>
      <label class="dash-modal__label">
        Название
        <input class="dash-modal__input" type="text" bind:value={newCardTitle} placeholder="Название карточки" />
      </label>
      <div class="dash-modal__actions">
        <button class="dash-btn dash-btn--cancel" on:click={() => { showAddCardModal = false; }}>Отмена</button>
        <button class="dash-btn dash-btn--save" on:click={createNewCard}>Создать</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Card actions */
  .dashboard-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .dashboard-card__actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .dashboard-card:hover .dashboard-card__actions {
    opacity: 1;
  }

  .dash-btn {
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--text-muted);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1;
    transition: background 0.15s, color 0.15s;
  }

  .dash-btn--icon {
    min-width: 24px;
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dash-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .dash-btn--danger:hover {
    background: var(--background-modifier-error);
    color: var(--text-error);
  }

  .dash-btn--sm {
    padding: 2px 6px;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .dashboard-card__item:hover .dash-btn--sm {
    opacity: 1;
  }

  .dash-link-label {
    flex: 1;
  }

  .dashboard-card__empty {
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
    padding: 16px 0;
  }

  /* Add card button */
  .dashboard-card--add {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 160px;
    border: 2px dashed var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    opacity: 1;
    transform: none;
    animation: none;
  }

  .dashboard-card--add:hover {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 5%, transparent);
  }

  .dashboard-card__add-icon {
    font-size: 28px;
    color: var(--text-faint);
    transition: color 0.2s;
  }

  .dashboard-card--add:hover .dashboard-card__add-icon {
    color: var(--interactive-accent);
  }

  .dashboard-card__add-text {
    font-size: 13px;
    color: var(--text-faint);
  }

  .dashboard-card--add:hover .dashboard-card__add-text {
    color: var(--interactive-accent);
  }

  /* Modal */
  .dash-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dash-modal {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    padding: 24px;
    min-width: 320px;
    max-width: 420px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  }

  .dash-modal__title {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
  }

  .dash-modal__label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .dash-modal__input {
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  .dash-modal__input:focus {
    border-color: var(--interactive-accent);
  }

  .dash-modal__input-row {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }

  .dash-modal__input-row .dash-modal__input {
    flex: 1;
    min-width: 0;
  }

  .dash-btn--browse {
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .dash-btn--browse:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .dash-modal__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .dash-btn--cancel {
    padding: 6px 14px;
    border-radius: 8px;
  }

  .dash-btn--save {
    padding: 6px 14px;
    border-radius: 8px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .dash-btn--save:hover {
    opacity: 0.9;
  }
</style>
