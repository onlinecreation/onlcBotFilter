/** Version à charger par une balise `<script>` : `window.onlcBotFilter`, association automatique des `form[data-onlc-bot-filter]`. */
import { attach, autoAttach, BotFilter, BotFilterError } from './index';

const api = { attach, autoAttach, BotFilter, BotFilterError };
(globalThis as unknown as { onlcBotFilter: typeof api }).onlcBotFilter = api;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoAttach());
else autoAttach();
