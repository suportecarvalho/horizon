using Facepunch;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Oxide.Core;
using Oxide.Core.Configuration;
using Oxide.Core.Libraries;
using Oxide.Core.Plugins;
using Oxide.Game.Rust.Cui;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("Kits", "k1lly0u", "4.4.10"), Description("Create kits containing items that players can redeem")]
    class Kits : RustPlugin
    {
        #region Fields
        [PluginReference]
        private Plugin CopyPaste, ImageLibrary, ServerRewards, Economics, PlayerDLCAPI;

        private DateTime _deprecatedHookTime = new DateTime(2021, 12, 31);

        private Hash<ulong, KitData.Kit> _kitCreators = new Hash<ulong, KitData.Kit>();
        
        private static Func<BasePlayer, ulong, bool> _canUseSkin;
        private static Func<BasePlayer, int, int> _getRedirectedIfNotOwned;

        private const string ADMIN_PERMISSION = "kits.admin";
        private const string BLUEPRINT_BASE = "blueprintbase";
        #endregion

        #region Oxide Hooks
        private void Loaded()
        {
            _canUseSkin = CanUseSkin;
            _getRedirectedIfNotOwned = GetRedirectedItemIdIfNotOwned;
            
            LoadData();

            permission.RegisterPermission(ADMIN_PERMISSION, this);
            kitData.RegisterPermissions(permission, this);

            _costType = ParseType<CostType>(Configuration.Currency);

            cmd.AddChatCommand(Configuration.Command, this, cmdKit);
            cmd.AddChatCommand("vip", this, cmdKit);
            cmd.AddConsoleCommand(Configuration.Command, this, "ccmdKit");
        }

        protected override void LoadDefaultMessages() => lang.RegisterMessages(Messages, this);

        private void OnServerInitialized()
        {
            LastWipeTime = SaveRestore.SaveCreatedTime.Subtract(Epoch).TotalSeconds;

            kitData.RegisterImages(ImageLibrary);

            CheckForShortnameUpdates();

            if (Configuration.AutoKits.Count == 0)
                Unsubscribe(nameof(OnPlayerRespawned));
            
            if (!Configuration.OwnedSkins)
                Debug.LogWarning("[Kits] WARNING! As of August 7th 2025, granting access to paid skins that users do not own is against Rust's Terms of Service and can result in your server being delisted or worse.\n" +
                                 "If you continue to allow users to use paid skins, you do so at your own risk!\n" +
                                 "You can prevent users access to skins they do not own by enabling 'Only show/give players skins that they are allowed to use' in the config\n" +
                                 "https://facepunch.com/legal/servers");
            else if (!PlayerDLCAPI)
                Debug.LogWarning("[Kits] - PlayerDLCAPI plugin is not loaded, skin ownership checks will not work!");
        }

        private void OnNewSave(string filename)
        {
            if (Configuration.WipeData)
                playerData.Wipe();
        }

        private void OnServerSave() => SavePlayerData();

        private void OnPlayerRespawned(BasePlayer player)
        {
            if (!player)
                return;

            if ((Interface.Oxide.CallDeprecatedHook("canRedeemKit", "CanRedeemKit", _deprecatedHookTime, player) ?? Interface.Oxide.CallHook("CanRedeemKit", player)) != null)
                return;

            if (Interface.Oxide.CallHook("CanRedeemAutoKit", player) != null)
                return;

            if (Configuration.AllowAutoToggle && !playerData[player.userID].ClaimAutoKits)
            {
                player.ChatMessage(Message("Error.AutoKitDisabled", player.userID));
                return;
            }

            for (int i = 0; i < Configuration.AutoKits.Count; i++)
            {
                if (!kitData.Find(Configuration.AutoKits[i], out KitData.Kit kit))
                    continue;

                object success = CanClaimKit(player, kit, true);
                if (success != null)
                    continue;

                player.inventory.Strip();

                success = GiveKit(player, kit);
                if (success is string)
                    continue;

                OnKitReceived(player, kit);
                return;
            }
        }

        private void Unload()
        {
            if (!Interface.Oxide.IsShuttingDown)
                SavePlayerData();

            foreach (BasePlayer player in BasePlayer.activePlayerList)
            {
                CuiHelper.DestroyUi(player, UI_MENU);
                CuiHelper.DestroyUi(player, UI_POPUP);
            }

            Configuration = null;
        }
        #endregion

        #region Kit Claiming
        private bool TryClaimKit(BasePlayer player, string name, bool usingUI)
        {
            if (string.IsNullOrEmpty(name))
            {
                if (usingUI)
                    CreateMenuPopup(player, Message("Error.EmptyKitName", player.userID));
                else player.ChatMessage(Message("Error.EmptyKitName", player.userID));
                return false;
            }

            if (!kitData.Find(name, out KitData.Kit kit))
            {
                if (usingUI)
                    CreateMenuPopup(player, Message("Error.InvalidKitName", player.userID));
                else player.ChatMessage(Message("Error.InvalidKitName", player.userID));
                return false;
            }

            object success = CanClaimKit(player, kit) ?? GiveKit(player, kit);
            if (success is string s)
            {
                if (usingUI)
                    CreateMenuPopup(player, s);
                else player.ChatMessage(s);
                return false;
            }

            OnKitReceived(player, kit);
            return true;
        }

        private object CanClaimKit(BasePlayer player, KitData.Kit kit, bool ignoreAuthCost = false)
        {
            object success = Interface.Oxide.CallDeprecatedHook("canRedeemKit", "CanRedeemKit", _deprecatedHookTime, player) ?? Interface.Oxide.CallHook("CanRedeemKit", player);
            if (success != null)
            {
                if (success is string s)
                    return s;
                return Message("Error.CantClaimNow", player.userID);
            }

            if (!ignoreAuthCost && kit.RequiredAuth > 0 && player.net.connection.authLevel < kit.RequiredAuth)
                return Message("Error.CanClaim.Auth", player.userID);

            if (Configuration.AdminIgnoreRestrictions && IsAdmin(player))
            {
                if (!kit.HasSpaceForItems(player))
                    return Message("Error.CanClaim.InventorySpace", player.userID);

                return null;
            }

            if (!string.IsNullOrEmpty(kit.RequiredPermission) && !permission.UserHasPermission(player.UserIDString, kit.RequiredPermission))
                return Message("Error.CanClaim.Permission", player.userID);

            if (Configuration.WipeCooldowns.TryGetValue(kit.Name, out int wipeCooldownTime))
            {
                if (kitData.IsOnWipeCooldown(wipeCooldownTime, out wipeCooldownTime))
                    return string.Format(Message("Error.CanClaim.WipeCooldown", player.userID), FormatTime(wipeCooldownTime));
            }

            if (playerData.Find(player.userID, out PlayerData.PlayerUsageData playerUsageData))
            {
                if (kit.Cooldown > 0)
                {
                    double cooldownRemaining = playerUsageData.GetCooldownRemaining(kit.Name);
                    if (cooldownRemaining > 0)
                        return string.Format(Message("Error.CanClaim.Cooldown", player.userID), FormatTime(cooldownRemaining));
                }

                if (kit.MaximumUses > 0)
                {
                    int currentUses = playerUsageData.GetKitUses(kit.Name);
                    if (currentUses >= kit.MaximumUses)
                        return Message("Error.CanClaim.MaxUses", player.userID);
                }
            }

            if (!kit.HasSpaceForItems(player))
                return Message("Error.CanClaim.InventorySpace", player.userID);

            if (!ignoreAuthCost && kit.Cost > 0)
            {
                if (!ChargePlayer(player, kit.Cost))
                    return string.Format(Message("Error.CanClaim.InsufficientFunds", player.userID), kit.Cost, Message($"Cost.{_costType}", player.userID));
            }

            return null;
        }

        private object GiveKit(BasePlayer player, KitData.Kit kit)
        {
            if (!string.IsNullOrEmpty(kit.CopyPasteFile))
            {
                object success = CopyPaste?.CallHook("TryPasteFromSteamId", player.userID, kit.CopyPasteFile, Configuration.CopyPasteParams, null);
                if (success != null)
                    return success;
            }

            kit.GiveItemsTo(player);

            return true;
        }

        private void OnKitReceived(BasePlayer player, KitData.Kit kit)
        {
            playerData[player.userID].OnKitClaimed(kit);

            Interface.CallHook("OnKitRedeemed", player, kit.Name);

            if (Configuration.LogKitsGiven)
                LogToFile("Kits_Received", $"{player.displayName} ({player.userID}) - Received {kit.Name}", this);
        }
        #endregion

        #region Purchase Costs     
        private CostType _costType;

        private enum CostType { Scrap, ServerRewards, Economics }

        private const int SCRAP_ITEM_ID = -932201673;

        private bool ChargePlayer(BasePlayer player, int amount)
        {
            if (amount == 0)
                return true;

            switch (_costType)
            {
                case CostType.Scrap:
                    if (amount <= player.inventory.GetAmount(SCRAP_ITEM_ID))
                    {
                        player.inventory.Take(null, SCRAP_ITEM_ID, amount);
                        return true;
                    }
                    return false;
                case CostType.ServerRewards:
                    {
                        if ((ServerRewards?.Call<int>("CheckPoints", player.UserIDString) ?? 0) < amount)
                            return false;

                        return (bool)ServerRewards?.Call("TakePoints", player.userID, amount);
                    }
                case CostType.Economics:
                    return (bool)Economics?.Call("Withdraw", player.UserIDString, (double)amount);
            }
            return false;
        }
        #endregion

        #region Helpers
        private T ParseType<T>(string type)
        {
            try
            {
                return (T)Enum.Parse(typeof(T), type, true);
            }
            catch
            {
                return default(T);
            }
        }

        private string FormatTime(double time)
        {
            TimeSpan dateDifference = TimeSpan.FromSeconds(time);
            int days = dateDifference.Days;
            int hours = dateDifference.Hours;
            int mins = dateDifference.Minutes;
            int secs = dateDifference.Seconds;

            if (days > 0)
                return $"~{days:00}d:{hours:00}h";
            if (hours > 0)
                return $"~{hours:00}h:{mins:00}m";
            return mins > 0 ? $"{mins:00}m:{secs:00}s" : $"{secs}s";
        }

        private void GetUserValidKits(BasePlayer player, List<KitData.Kit> list, ulong npcId = 0UL)
        {
            bool isAdmin = IsAdmin(player);
            kitData.ForEach(kit =>
            {
                if (kit.IsHidden && !isAdmin)
                    return;

                if (player.net.connection.authLevel < kit.RequiredAuth)
                    return;

                list.Add(kit);
            });
        }

        private bool IsAdmin(BasePlayer player) => permission.UserHasPermission(player.UserIDString, ADMIN_PERMISSION);

        private BasePlayer FindPlayer(string partialNameOrID) => BasePlayer.allPlayerList.FirstOrDefault(x => x.UserIDString.Equals(partialNameOrID) ||            
                                                                                                                x.displayName.Equals(partialNameOrID, StringComparison.OrdinalIgnoreCase) ||
                                                                                                                x.displayName.Contains(partialNameOrID, CompareOptions.OrdinalIgnoreCase));

        private BasePlayer RaycastPlayer(BasePlayer player)
        {
            if (!Physics.Raycast(new Ray(player.eyes.position, Quaternion.Euler(player.serverInput.current.aimAngles) * Vector3.forward), out RaycastHit raycastHit, 5f))
                return null;

            return raycastHit.collider.GetComponentInParent<BasePlayer>();            
        }
        
        private bool CanUseSkin(BasePlayer player, ulong skinID)
        {
            if (skinID == 0UL)
                return true;
            
            if (Configuration.NPCSkins && (player.IsNpc || !player.userID.IsSteamId()))
                return Configuration.NPCSkins;

            if (PlayerDLCAPI != null && Configuration.OwnedSkins)
                return PlayerDLCAPI.Call<bool>("IsOwnedOrFreeSkin", player, skinID);
            
            return true;
        }

        private int GetRedirectedItemIdIfNotOwned(BasePlayer player, int itemId)
        {
            if (Configuration.NPCSkins && (player.IsNpc || !player.userID.IsSteamId()))
                return itemId;
            
            if (PlayerDLCAPI != null && Configuration.OwnedSkins)
                return PlayerDLCAPI.Call<int>("GetRedirectedItemIdIfNotOwned", player, itemId);
            
            return itemId;
        }

        private static DateTime Epoch = new DateTime(1970, 1, 1, 0, 0, 0);
        private static double LastWipeTime;
        private static double CurrentTime => DateTime.UtcNow.Subtract(Epoch).TotalSeconds;
        #endregion

        #region ImageLibrary        
        private void RegisterImage(string name, string url) => ImageLibrary?.Call("AddImage", url, name.Replace(" ", ""), 0UL, null);

        private static string GetKitImageKey(KitData.Kit kit)
        {
            unchecked
            {
                uint hash = 2166136261;
                string value = kit?.KitImage ?? string.Empty;
                for (int i = 0; i < value.Length; i++)
                    hash = (hash ^ value[i]) * 16777619;
                return (kit?.Name ?? string.Empty).Replace(" ", "") + "_" + hash.ToString("X8");
            }
        }

        private string GetImage(string name, ulong skinId = 0UL) => ImageLibrary?.Call<string>("GetImage", name.Replace(" ", ""), skinId, false);
        #endregion

        #region HumanNPC
        private void OnUseNPC(BasePlayer npcPlayer, BasePlayer player)
        {
            OpenKitGrid(player);
        }
        #endregion

        #region API
        [HookMethod("GiveKit")]
        public object GiveKit(BasePlayer player, string name)
        {
            if (!player)
                return null;

            if (string.IsNullOrEmpty(name))
                return Message("Error.EmptyKitName", player.userID);

            if (!kitData.Find(name, out KitData.Kit kit))
                return Message("Error.InvalidKitName", player.userID);

            return GiveKit(player, kit);
        }

        [HookMethod("IsKit")]
        public bool IsKit(string name) => !string.IsNullOrEmpty(name) && kitData.Exists(name);

        [HookMethod("GetKitNames")]
        public void GetKitNames(List<string> list) => list.AddRange(kitData.Keys);

        [HookMethod("GetKitImage")]
        public string GetKitImage(string name) => kitData[name]?.KitImage ?? string.Empty;

        [HookMethod("GetKitDescription")]
        public string GetKitDescription(string name) => kitData[name]?.Description ?? string.Empty;

        [HookMethod("GetKitMaxUses")]
        public int GetKitMaxUses(string name) => kitData[name]?.MaximumUses ?? 0;

        [HookMethod("GetKitCooldown")]
        public int GetKitCooldown(string name) => kitData[name]?.Cooldown ?? 0;

        [HookMethod("GetPlayerKitUses")]
        public int GetPlayerKitUses(ulong playerId, string name) => playerData.Exists(playerId) ? playerData[playerId].GetKitUses(name) : 0;

        [HookMethod("SetPlayerKitUses")]
        public void SetPlayerKitUses(ulong playerId, string name, int amount)
        {
            if (playerData.Exists(playerId))
                playerData[playerId].SetKitUses(name, amount);
        }

        [HookMethod("GetPlayerKitCooldown")]
        public double GetPlayerKitCooldown(ulong playerId, string name) => playerData.Exists(playerId) ? playerData[playerId].GetCooldownRemaining(name) : 0;

        [HookMethod("SetPlayerKitCooldown")]
        public void SetPlayerCooldown(ulong playerId, string name, double seconds)
        {
            if (playerData.Exists(playerId))
                playerData[playerId].SetCooldownRemaining(name, seconds);
        }
        #endregion

        #region UI
        private const string UI_MENU = "kits.menu";
        private const string UI_POPUP = "kits.popup";

        private const string DEFAULT_ICON = "kits.defaultkiticon";
        private const string MAGNIFY_ICON = "kits.magnifyicon";

        #region Kit Grid / VIP View
        private void OpenKitGrid(BasePlayer player, int page = 0, ulong npcId = 0UL, string category = "vip")
        {
            // O Horizon não tem kits pay-to-win com itens. 
            // O menu /kit ou /vip abre diretamente o painel do VIP Qualidade de Vida.
            CuiElementContainer container = UI.Container(UI_MENU, "0.035 0.025 0.025 0.88", new UI4(0.20f, 0.12f, 0.80f, 0.88f), true, "Hud");

            // Cabeçalho moderno Horizon
            UI.Panel(container, UI_MENU, "0.20 0.18 0.18 0.88", new UI4(0.0f, 0.92f, 1.0f, 1.0f));
            UI.Label(container, UI_MENU, "<b>HORIZON VIP</b>", 20, new UI4(0.025f, 0.925f, 0.88f, 0.99f), TextAnchor.MiddleLeft);
            UI.Button(container, UI_MENU, "0.82 0.20 0.13 1.0", "<b>×</b>", 18, new UI4(0.965f, 0.945f, 0.99f, 0.985f), "kits.close");

            if (IsAdmin(player) && npcId == 0UL)
                UI.Button(container, UI_MENU, "0.78 0.30 0.12 1.0", Message("UI.CreateNew", player.userID), 14, new UI4(0.82f, 0.935f, 0.94f, 0.985f), "kits.create");

            CreateVipInfoView(container);

            // Faixa da loja VIP com link direto
            UI.Panel(container, UI_MENU, "0.12 0.13 0.15 0.98", new UI4(0.055f, 0.025f, 0.945f, 0.125f));
            UI.Panel(container, UI_MENU, "0.82 0.28 0.15 1.0", new UI4(0.055f, 0.025f, 0.059f, 0.125f));

            UI.Label(container, UI_MENU, "<size=15><b><color=#E34F38>LOJA RUST HORIZON</color></b></size> <color=#A0A0A0>|</color> <color=#DDDDDD>Ativação 100% automática no servidor!</color>", 14,
                new UI4(0.075f, 0.070f, 0.68f, 0.115f), TextAnchor.MiddleLeft);
                
            UI.Label(container, UI_MENU, "<color=#A0A0A0>Acesse:</color> <b><color=#55D6FF>www.rusthorizon.shop</color></b>", 13,
                new UI4(0.075f, 0.030f, 0.68f, 0.070f), TextAnchor.MiddleLeft);

            UI.Button(container, UI_MENU, "0.82 0.28 0.15 1.0", "<b>VER LINK NO CHAT</b>", 12,
                new UI4(0.77f, 0.045f, 0.92f, 0.105f), "kits.store");

            CuiHelper.DestroyUi(player, UI_MENU);
            CuiHelper.AddUi(player, container);
        }

        private void CreateVipInfoView(CuiElementContainer container)
        {
            // O VIP do Rust Horizon é 100% focado em conveniência e Qualidades de Vida (Zero P2W)
            UI.Panel(container, UI_MENU, "0.10 0.12 0.15 0.97",
                new UI4(0.055f, 0.145f, 0.945f, 0.895f));

            UI.Label(container, UI_MENU,
                "<size=24><b><color=#FF8A3D>HORIZON VIP • QUALIDADE DE VIDA</color></b></size>",
                22, new UI4(0.08f, 0.81f, 0.92f, 0.88f), TextAnchor.MiddleCenter);

            UI.Label(container, UI_MENU,
                "<color=#E8E8E8>Benefícios exclusivos de conveniência ativos por 30 dias:</color>",
                14, new UI4(0.08f, 0.74f, 0.92f, 0.81f), TextAnchor.MiddleCenter);

            UI.Label(container, UI_MENU,
                "★ <b>TAG VIP</b> - Destaque VIP no chat com nome colorido em vermelho\n\n" +
                "★ <b>/SKIN</b> - Acesso liberado para aplicar skins em todos os itens\n\n" +
                "★ <b>/REMOVE</b> - Ferramenta de remoção rápida de construções na sua base\n\n" +
                "★ <b>SKINS TC</b> - Aplicar skins nas paredes e estruturas da base\n\n" +
                "★ <b>ALCANCE DA BANCADA</b> - Use a bancada de trabalho de qualquer cômodo da base\n\n" +
                "★ <b>ORGANIZADOR DE BAÚS</b> - Organizar e ordenar inventários e baús com 1 clique\n\n" +
                "★ <b>PRIORIDADE NA FILA</b> - Skip queue com preferência máxima para entrar no servidor\n\n" +
                "★ <b>RECICLADORA 2X</b> - Reciclar componentes e itens duas vezes mais rápido",
                14, new UI4(0.14f, 0.22f, 0.86f, 0.73f), TextAnchor.UpperLeft);

            UI.Label(container, UI_MENU,
                "<color=#94A3B8><i>O Rust Horizon preza pelo Fair Play: o VIP não concede armas, recursos ou vantagens injustas de combate.</i></color>",
                12, new UI4(0.08f, 0.16f, 0.92f, 0.21f), TextAnchor.MiddleCenter);

            UI.Button(container, UI_MENU, "0.82 0.28 0.15 1.0",
                "<b>COMPRAR VIP NA LOJA OFICIAL (WWW.RUSTHORIZON.SHOP)</b>", 13,
                new UI4(0.24f, 0.08f, 0.76f, 0.145f), "kits.store");
        }
        #endregion

        #region Kit View & Editor       
        private void OpenKitView(BasePlayer player, string name, int page, ulong npcId, string category = "vip")
        {
            OpenKitGrid(player);
        }

        private void OpenKitsEditor(BasePlayer player, bool overwrite = false)
        {
            if (!_kitCreators.TryGetValue(player.userID, out KitData.Kit kit))
                return;

            CuiElementContainer container = UI.Container(UI_MENU, "0.035 0.025 0.025 0.88", new UI4(0.20f, 0.12f, 0.80f, 0.88f), true, "Hud");

            UI.Panel(container, UI_MENU, Configuration.Menu.Panel.Get, new UI4(0.0f, 0.92f, 1.0f, 1.0f));

            UI.Label(container, UI_MENU, Message("UI.Title.Editor", player.userID), 20, new UI4(0.025f, 0.925f, 0.88f, 0.99f), TextAnchor.MiddleLeft);

            UI.Button(container, UI_MENU, Configuration.Menu.Color3.Get, "<b>×</b>", 16, new UI4(0.965f, 0.945f, 0.99f, 0.985f), "kits.close");

            // Kit Options
            AddTitleSperator(container, 0, Message("UI.Details", player.userID));
            AddInputField(container, 1, Message("UI.Name", player.userID), "name", kit.Name);
            AddInputField(container, 2, Message("UI.Description", player.userID), "description", kit.Description, 3);
            AddInputField(container, 6, Message("UI.IconURL", player.userID), "image", kit.KitImage);

            AddTitleSperator(container, 7, Message("UI.UsageAuthority", player.userID));
            AddInputField(container, 8, Message("UI.Permission", player.userID), "permission", kit.RequiredPermission);
            AddInputField(container, 9, Message("UI.AuthLevel", player.userID), "authLevel", kit.RequiredAuth);
            AddToggleField(container, 10, Message("UI.IsHidden", player.userID), "isHidden", kit.IsHidden);

            AddTitleSperator(container, 11, Message("UI.Usage", player.userID));
            AddInputField(container, 12, Message("UI.MaxUses", player.userID), "maximumUses", kit.MaximumUses);
            AddInputField(container, 13, Message("UI.CooldownSeconds", player.userID), "cooldown", kit.Cooldown);
            AddInputField(container, 14, Message("UI.PurchaseCost", player.userID), "cost", kit.Cost);

            AddTitleSperator(container, 15, Message("UI.CopyPaste", player.userID));
            AddInputField(container, 16, Message("UI.FileName", player.userID), "copyPaste", kit.CopyPasteFile);

            CreateKitLayout(player, container, kit);

            UI.Button(container, UI_MENU, Configuration.Menu.Color2.Get, Message("UI.SaveKit", player.userID), 14, new UI4(0.005f, 0.005f, 0.2475f, 0.045f), $"kits.savekit {overwrite}");
            UI.Toggle(container, UI_MENU, ICON_BACKGROUND_COLOR, 14, new UI4(0.2525f, 0.005f, 0.2825f, 0.045f), $"kits.toggleoverwrite {overwrite}", overwrite);
            UI.Label(container, UI_MENU, Message("UI.Overwrite", player.userID), 14, new UI4(0.2875f, 0.005f, 0.495f, 0.045f), TextAnchor.MiddleLeft);

            UI.Button(container, UI_MENU, Configuration.Menu.Color3.Get, Message("UI.ClearItems", player.userID), 14, new UI4(0.505f, 0.005f, 0.7475f, 0.045f), $"kits.clearitems {overwrite}");
            UI.Button(container, UI_MENU, Configuration.Menu.Color2.Get, Message("UI.CopyInv", player.userID), 14, new UI4(0.7525f, 0.005f, 0.995f, 0.045f), $"kits.copyinv {overwrite}");

            CuiHelper.DestroyUi(player, UI_MENU);
            CuiHelper.AddUi(player, container);
        }

        #region Editor Helpers
        private const float EDITOR_ELEMENT_HEIGHT = 0.04f;

        private void AddInputField(CuiElementContainer container, int index, string title, string fieldName, object currentValue, int additionalHeight = 0)
        {
            float yMin = GetVerticalPos(index, 0.88f);
            float yMax = yMin + EDITOR_ELEMENT_HEIGHT;

            if (additionalHeight != 0)
                yMin = GetVerticalPos(index + additionalHeight, 0.88f);

            UI.Panel(container, UI_MENU, Configuration.Menu.Color4.Get, new UI4(0.005f, yMin, 0.175f, yMax));
            UI.Label(container, UI_MENU, title, 12, new UI4(0.01f, yMin, 0.175f, yMax - 0.0075f), TextAnchor.UpperLeft);

            UI.Panel(container, UI_MENU, ICON_BACKGROUND_COLOR, new UI4(0.175f, yMin, 0.495f, yMax));

            string label = GetInputLabel(currentValue);
            if (!string.IsNullOrEmpty(label))
            {
                UI.Label(container, UI_MENU, label, 12, new UI4(0.18f, yMin, 0.47f, yMax - 0.0075f), TextAnchor.UpperLeft);
                UI.Button(container, UI_MENU, Configuration.Menu.Color3.Get, "X", 14, new UI4(0.47f, yMax - EDITOR_ELEMENT_HEIGHT, 0.495f, yMax), $"kits.clear {fieldName}");
            }
            else UI.Input(container, UI_MENU, string.Empty, 12, $"kits.creator {fieldName}", new UI4(0.18f, yMin, 0.495f, yMax - 0.0075f), TextAnchor.UpperLeft);
        }

        private void AddTitleSperator(CuiElementContainer container, int index, string title)
        {
            float yMin = GetVerticalPos(index, 0.88f);
            float yMax = yMin + EDITOR_ELEMENT_HEIGHT;

            UI.Panel(container, UI_MENU, Configuration.Menu.Color1.Get, new UI4(0.005f, yMin, 0.495f, yMax));
            UI.Label(container, UI_MENU, title, 14, new UI4(0.01f, yMin, 0.495f, yMax), TextAnchor.MiddleLeft);
        }

        private void AddLabelField(CuiElementContainer container, int index, string title, string value, int additionalHeight = 0)
        {
            float yMin = GetVerticalPos(index, 0.88f);
            float yMax = yMin + EDITOR_ELEMENT_HEIGHT;

            if (additionalHeight != 0)
                yMin = GetVerticalPos(index + additionalHeight, 0.88f);

            UI.Panel(container, UI_MENU, Configuration.Menu.Color4.Get, new UI4(0.005f, yMin, 0.175f, yMax));
            UI.Label(container, UI_MENU, title, 12, new UI4(0.01f, yMin, 0.175f, yMax - 0.0075f), TextAnchor.UpperLeft);

            UI.Panel(container, UI_MENU, ICON_BACKGROUND_COLOR, new UI4(0.175f, yMin, 0.495f, yMax));
            UI.Label(container, UI_MENU, value, 12, new UI4(0.18f, yMin, 0.495f, yMax - 0.0075f), TextAnchor.UpperLeft);
        }

        private void AddToggleField(CuiElementContainer container, int index, string title, string fieldName, bool currentValue)
        {
            float yMin = GetVerticalPos(index, 0.88f);
            float yMax = yMin + EDITOR_ELEMENT_HEIGHT;

            UI.Panel(container, UI_MENU, Configuration.Menu.Color4.Get, new UI4(0.005f, yMin, 0.175f, yMax));
            UI.Label(container, UI_MENU, title, 12, new UI4(0.01f, yMin, 0.175f, yMax), TextAnchor.MiddleLeft);
            UI.Toggle(container, UI_MENU, ICON_BACKGROUND_COLOR, 14, new UI4(0.175f, yMin, 0.205f, yMax), $"kits.creator {fieldName} {!currentValue}", currentValue);
        }

        private string GetInputLabel(object obj)
        {
            if (obj is string s)
                return string.IsNullOrEmpty(s) ? null : s;
            if (obj is int i)
                return i <= 0 ? null : i.ToString();
            if (obj is float f)
                return f <= 0 ? null : f.ToString();
            return null;
        }

        private float GetVerticalPos(int i, float start = 0.9f) => start - (i * (EDITOR_ELEMENT_HEIGHT + 0.005f));
        #endregion
        #endregion

        #region Kit Layout
        private const string ICON_BACKGROUND_COLOR = "1 1 1 0.15";

        private void CreateKitLayout(BasePlayer player, CuiElementContainer container, KitData.Kit kit)
        {
            UI.Panel(container, UI_MENU, Configuration.Menu.Color1.Get, new UI4(0.505f, 0.88f, 0.995f, 0.92f));
            UI.Label(container, UI_MENU, Message("UI.KitItems", player.userID), 14, new UI4(0.51f, 0.88f, 0.995f, 0.92f), TextAnchor.MiddleLeft);

            UI.Panel(container, UI_MENU, Configuration.Menu.Color4.Get, new UI4(0.505f, 0.835f, 0.995f, 0.875f));
            UI.Label(container, UI_MENU, Message("UI.MainItems", player.userID), 14, new UI4(0.51f, 0.835f, 0.995f, 0.875f), TextAnchor.MiddleLeft);
            CreateInventoryItems(player, container, MainAlign, kit.MainItems, 24);
            
            UI.Panel(container, UI_MENU, Configuration.Menu.Color4.Get, new UI4(0.505f, 0.365f, 0.995f, 0.405f));
            UI.Label(container, UI_MENU, Message("UI.WearItems", player.userID), 14, new UI4(0.51f, 0.365f, 0.995f, 0.405f), TextAnchor.MiddleLeft);
            CreateInventoryItems(player, container, WearAlign, kit.WearItems, 8);
            
            UI.Panel(container, UI_MENU, Configuration.Menu.Color4.Get, new UI4(0.505f, 0.2225f, 0.995f, 0.2625f));
            UI.Label(container, UI_MENU, Message("UI.BeltItems", player.userID), 14, new UI4(0.51f, 0.2225f, 0.995f, 0.2625f), TextAnchor.MiddleLeft);
            CreateInventoryItems(player, container, BeltAlign, kit.BeltItems, 6);            
        }

        private void CreateInventoryItems(BasePlayer player, CuiElementContainer container, GridAlignment alignment, ItemData[] items, int capacity)
        {
            for (int i = 0; i < capacity; i++)
                UI.Panel(container, UI_MENU, ICON_BACKGROUND_COLOR, alignment.Get(i));

            for (int i = 0; i < items.Length; i++)
            {
                ItemData itemData = items[i];
                if (itemData.Position > capacity - 1)
                    continue;

                int itemId = GetRedirectedItemIdIfNotOwned(player, itemData.ItemID);
                ulong skinId = CanUseSkin(player, itemData.Skin) ? itemData.Skin : 0UL;

                UI4 position = alignment.Get(itemData.Position);

                UI.Image(container, UI_MENU, itemId, skinId, position);

                if (itemData.IsBlueprint && !string.IsNullOrEmpty(itemData.BlueprintShortname))
                    UI.Image(container, UI_MENU, itemData.BlueprintItemID, 0UL, position);

                if (itemData.Amount > 1)
                    UI.Label(container, UI_MENU, $"x{itemData.Amount}", 10, position, TextAnchor.LowerRight);
            }
        }
        #endregion

        #region Popup Messages
        private void CreateMenuPopup(BasePlayer player, string text, float duration = 5f)
        {
            CuiElementContainer container = UI.Container(UI_POPUP, Configuration.Menu.Color4.Get, new UI4(0.2f, 0.11f, 0.8f, 0.15f));
            UI.Label(container, UI_POPUP, text, 14, UI4.Full);

            CuiHelper.DestroyUi(player, UI_POPUP);
            CuiHelper.AddUi(player, container);

            player.Invoke(() => CuiHelper.DestroyUi(player, UI_POPUP), duration);
        }
        #endregion

        #region UI Grid Helper
        private readonly GridAlignment MainAlign = new GridAlignment(6, 0.545f, 0.065f, 0.0035f, 0.8275f, 0.1f, 0.005f);
        private readonly GridAlignment WearAlign = new GridAlignment(8, 0.505f, 0.0581875f, 0.0035f, 0.3575f, 0.0875f, 0.005f);
        private readonly GridAlignment BeltAlign = new GridAlignment(6, 0.545f, 0.065f, 0.0035f, 0.215f, 0.1f, 0.005f);

        private class GridAlignment
        {
            private readonly int _columns;
            private readonly float _xOffset;
            private readonly float _width;
            private readonly float _xSpacing;
            private readonly float _yOffset;
            private readonly float _height;
            private readonly float _ySpacing;

            internal GridAlignment(int columns, float xOffset, float width, float xSpacing, float yOffset, float height, float ySpacing)
            {
                _columns = columns;
                _xOffset = xOffset;
                _width = width;
                _xSpacing = xSpacing;
                _yOffset = yOffset;
                _height = height;
                _ySpacing = ySpacing;
            }

            internal UI4 Get(int index)
            {
                int rowNumber = index == 0 ? 0 : Mathf.FloorToInt(index / (float)_columns);
                int columnNumber = index - (rowNumber * _columns);

                float offsetX = _xOffset + (_width * columnNumber) + (_xSpacing * columnNumber);
                float offsetY = (_yOffset - (rowNumber * _height) - (_ySpacing * rowNumber));

                return new UI4(offsetX, offsetY - _height, offsetX + _width, offsetY);
            }
        }
        #endregion
        #endregion

        #region UI Commands
        [ConsoleCommand("kits.store")]
        private void ccmdKitsStore(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Connection?.player as BasePlayer;
            if (player == null)
                return;

            player.ChatMessage("<color=#FF8A3D><b>RUST HORIZON</b></color> - Loja VIP Oficial: <color=#55D6FF>www.rusthorizon.shop</color>");
            player.ChatMessage("Copie o endereço acima e acesse pelo navegador para adquirir seu VIP 100% focado em qualidade de vida.");
        }

        [ConsoleCommand("kits.close")]
        private void ccmdKitsClose(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Connection.player as BasePlayer;
            if (!player)
                return;

            _kitCreators.Remove(player.userID);

            CuiHelper.DestroyUi(player, UI_MENU);
            CuiHelper.DestroyUi(player, UI_POPUP);
        }

        [ConsoleCommand("kits.gridview")]
        private void ccmdKitsGridView(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Connection.player as BasePlayer;
            if (!player)
                return;

            OpenKitGrid(player);
        }

        [ConsoleCommand("kits.create")]
        private void ccmdCreateKit(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Player();
            if (!player)
                return;

            if (IsAdmin(player))
            {
                _kitCreators[player.userID] = new KitData.Kit();
                OpenKitsEditor(player);
            }
        }

        [ConsoleCommand("kits.edit")]
        private void ccmdEditKit(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Player();
            if (!player)
                return;

            if (IsAdmin(player))
            {
                string name = CommandSafe(arg.GetString(0), true);

                if (!kitData.Find(name, out KitData.Kit editKit))
                {
                    player.ChatMessage(string.Format(Message("Chat.Error.DoesntExist", player.userID), name));
                    return;
                }

                _kitCreators[player.userID] = KitData.Kit.CloneOf(editKit);
                OpenKitsEditor(player);
            }
        }

        [ConsoleCommand("kits.savekit")]
        private void ccmdSaveKit(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Player();
            if (!player)
                return;

            if (!_kitCreators.TryGetValue(player.userID, out KitData.Kit kit))
                return;

            if (string.IsNullOrEmpty(kit.Name))
            {
                CreateMenuPopup(player, Message("SaveKit.Error.NoName", player.userID));
                return;
            }

            if (kit.ItemCount == 0 && string.IsNullOrEmpty(kit.CopyPasteFile))
            {
                CreateMenuPopup(player, Message("SaveKit.Error.NoContents", player.userID));
                return;
            }

            if (kitData.Exists(kit.Name) && !arg.GetBool(0))
            {
                CreateMenuPopup(player, Message("SaveKit.Error.Exists", player.userID));
                return;
            }

            kitData[kit.Name] = kit;
            SaveKitData();

            _kitCreators.Remove(player.userID);

            if (!string.IsNullOrEmpty(kit.RequiredPermission) && !permission.PermissionExists(kit.RequiredPermission))
                permission.RegisterPermission(kit.RequiredPermission, this);

            if (!string.IsNullOrEmpty(kit.KitImage))
                RegisterImage(GetKitImageKey(kit), kit.KitImage);

            OpenKitGrid(player);
            CreateMenuPopup(player, string.Format(Message("SaveKit.Success", player.userID), kit.Name));
        }

        [ConsoleCommand("kits.toggleoverwrite")]
        private void ccmdToggleOverwrite(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Player();
            if (!player)
                return;

            if (!_kitCreators.TryGetValue(player.userID, out KitData.Kit kit))
                return;

            OpenKitsEditor(player, !arg.GetBool(0));
        }

        [ConsoleCommand("kits.clearitems")]
        private void ccmdClearItems(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Player();
            if (!player)
                return;

            if (!_kitCreators.TryGetValue(player.userID, out KitData.Kit kit))
                return;

            kit.ClearItems();
            OpenKitsEditor(player);
        }

        [ConsoleCommand("kits.copyinv")]
        private void ccmdCopyInv(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Player();
            if (!player)
                return;

            if (!_kitCreators.TryGetValue(player.userID, out KitData.Kit kit))
                return;

            kit.CopyItemsFrom(player);
            OpenKitsEditor(player);
        }

        [ConsoleCommand("kits.clear")]
        private void ccmdClearField(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Player();
            if (!player)
                return;

            if (!_kitCreators.TryGetValue(player.userID, out KitData.Kit kit))
                return;

            string fieldName = arg.GetString(0);

            switch (fieldName)
            {
                case "name": kit.Name = string.Empty; break;
                case "description": kit.Description = string.Empty; break;
                case "copyPaste": kit.CopyPasteFile = string.Empty; break;
                case "permission": kit.RequiredPermission = string.Empty; break;
                case "image": kit.KitImage = string.Empty; break;
                case "cost": kit.Cost = 0; break;
                case "cooldown": kit.Cooldown = 0; break;                
                case "maximumUses": kit.MaximumUses = 0; break;
                case "authLevel": kit.RequiredAuth = 0; break;
            }

            OpenKitsEditor(player);
        }

        [ConsoleCommand("kits.creator")]
        private void ccmdSetField(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Player();
            if (!player)
                return;

            if (!_kitCreators.TryGetValue(player.userID, out KitData.Kit kit))
                return;

            if (arg.HasArgs(2))
            {
                SetParameter(player, kit, arg.GetString(0), string.Join(" ", arg.Args.Skip(1)));
                OpenKitsEditor(player);
            }
        }

        private void SetParameter(BasePlayer player, KitData.Kit kit, string fieldName, object value)
        {
            if (value == null) return;

            switch (fieldName)
            {
                case "name": kit.Name = (string)value; break;
                case "description": kit.Description = (string)value; break;
                case "copyPaste": kit.CopyPasteFile = (string)value; break;
                case "permission":
                    if (!((string)value).StartsWith("kits."))
                    {
                        CreateMenuPopup(player, Message("EditKit.PermissionPrefix", player.userID));
                        return;
                    }
                    kit.RequiredPermission = (string)value;
                    break;
                case "image": kit.KitImage = (string)value; break;
                case "cost":
                    if (TryConvertValue(value, out int intValCost)) kit.Cost = intValCost;
                    break;
                case "cooldown":
                    if (TryConvertValue(value, out int intValCd)) kit.Cooldown = intValCd;
                    break;
                case "maximumUses":
                    if (TryConvertValue(value, out int intValMax)) kit.MaximumUses = intValMax;
                    break;
                case "authLevel":
                    if (TryConvertValue(value, out int intValAuth)) kit.RequiredAuth = Mathf.Clamp(intValAuth, 0, 2);
                    break;
                case "isHidden":
                    if (TryConvertValue(value, out bool boolValHidden)) kit.IsHidden = boolValHidden;
                    break;
            }
        }

        private bool TryConvertValue<T>(object value, out T result)
        {
            try
            {
                result = (T)Convert.ChangeType(value, typeof(T));
                return true;
            }
            catch
            {
                result = default(T);
                return false;
            }
        }
        #endregion

        #region Command Helpers
        private static string CommandSafe(string text, bool unpack = false) => unpack ? text.Replace("▊▊", " ") : text.Replace(" ", "▊▊");
        #endregion

        #region UI Helper
        public static class UI
        {
            public static CuiElementContainer Container(string panel, string color, UI4 dimensions, bool blur = true, string parent = "Overlay")
            {
                CuiElementContainer container = new CuiElementContainer
                {
                    {
                        new CuiPanel
                        {
                            Image = { Color = color, Material = blur ? "assets/content/ui/uibackgroundblur-ingamemenu.mat" : string.Empty },
                            RectTransform = { AnchorMin = dimensions.GetMin(), AnchorMax = dimensions.GetMax() },
                            CursorEnabled = true
                        },
                        new CuiElement().Parent = parent,
                        panel
                    }
                };
                return container;
            }

            public static void Panel(CuiElementContainer container, string panel, string color, UI4 dimensions)
            {
                container.Add(new CuiPanel
                {
                    Image = { Color = color },
                    RectTransform = { AnchorMin = dimensions.GetMin(), AnchorMax = dimensions.GetMax() }
                }, panel);
            }

            public static void Label(CuiElementContainer container, string panel, string text, int size, UI4 dimensions, TextAnchor align = TextAnchor.MiddleCenter)
            {
                container.Add(new CuiLabel
                {
                    Text = { FontSize = size, Align = align, Text = text },
                    RectTransform = { AnchorMin = dimensions.GetMin(), AnchorMax = dimensions.GetMax() }
                }, panel);
            }

            public static void Button(CuiElementContainer container, string panel, string color, string text, int size, UI4 dimensions, string command, TextAnchor align = TextAnchor.MiddleCenter)
            {
                container.Add(new CuiButton
                {
                    Button = { Color = color, Command = command, FadeIn = 0f },
                    RectTransform = { AnchorMin = dimensions.GetMin(), AnchorMax = dimensions.GetMax() },
                    Text = { Text = text, FontSize = size, Align = align }
                }, panel);
            }

            public static void Button(CuiElementContainer container, string panel, string color, string png, UI4 dimensions, string command)
            {
                Panel(container, panel, color, dimensions);
                Image(container, panel, png, dimensions);
                Button(container, panel, "0 0 0 0", string.Empty, 0, dimensions, command);
            }

            public static void Input(CuiElementContainer container, string panel, string text, int size, string command, UI4 dimensions, TextAnchor anchor = TextAnchor.MiddleLeft)
            {
                container.Add(new CuiElement
                {
                    Name = CuiHelper.GetGuid(),
                    Parent = panel,
                    Components =
                    {
                        new CuiInputFieldComponent
                        {
                            Align = anchor,                            
                            CharsLimit = 300,
                            Command = command + text,
                            FontSize = size,
                            IsPassword = false,
                            Text = text,
                            NeedsKeyboard = true
                        },
                        new CuiRectTransformComponent {AnchorMin = dimensions.GetMin(), AnchorMax = dimensions.GetMax() }
                    }
                });
            }

            public static void Image(CuiElementContainer container, string panel, string png, UI4 dimensions)
            {
                container.Add(new CuiElement
                {
                    Name = CuiHelper.GetGuid(),
                    Parent = panel,
                    Components =
                    {
                        new CuiRawImageComponent {Png = png },
                        new CuiRectTransformComponent { AnchorMin = dimensions.GetMin(), AnchorMax = dimensions.GetMax() }
                    }
                });
            }

            public static void Image(CuiElementContainer container, string panel, int itemId, ulong skinId, UI4 dimensions)
            {
                container.Add(new CuiElement
                {
                    Name = CuiHelper.GetGuid(),
                    Parent = panel,
                    Components =
                    {
                        new CuiImageComponent { ItemId = itemId, SkinId = skinId },
                        new CuiRectTransformComponent { AnchorMin = dimensions.GetMin(), AnchorMax = dimensions.GetMax() }
                    }
                });
            }

            public static void Toggle(CuiElementContainer container, string panel, string boxColor, int fontSize, UI4 dimensions, string command, bool isOn)
            {
                Panel(container, panel, boxColor, dimensions);
                if (isOn)
                    Label(container, panel, "✔", fontSize, dimensions);
                Button(container, panel, "0 0 0 0", string.Empty, 0, dimensions, command);
            }

            public static string Color(string hexColor, float alpha)
            {
                if (hexColor.StartsWith("#"))
                    hexColor = hexColor.TrimStart('#');

                int red = int.Parse(hexColor.Substring(0, 2), NumberStyles.AllowHexSpecifier);
                int green = int.Parse(hexColor.Substring(2, 2), NumberStyles.AllowHexSpecifier);
                int blue = int.Parse(hexColor.Substring(4, 2), NumberStyles.AllowHexSpecifier);

                return $"{(double)red / 255} {(double)green / 255} {(double)blue / 255} {alpha}";
            }
        }

        public class UI4
        {
            public float xMin, yMin, xMax, yMax;

            public UI4(float xMin, float yMin, float xMax, float yMax)
            {
                this.xMin = xMin;
                this.yMin = yMin;
                this.xMax = xMax;
                this.yMax = yMax;
            }

            public string GetMin() => $"{xMin} {yMin}";
            public string GetMax() => $"{xMax} {yMax}";

            private static UI4 _full;
            public static UI4 Full
            {
                get
                {
                    if (_full == null)
                        _full = new UI4(0, 0, 1, 1);
                    return _full;
                }
            }
        }
        #endregion
                
        #region Chat Commands       
        private void cmdKit(BasePlayer player, string command, string[] args)
        {
            if (args.Length == 0)
            {
                OpenKitGrid(player);
                return;
            }

            bool isAdmin = IsAdmin(player);

            switch (args[0].ToLower())
            {
                case "help":
                    ReplyHelp(player);
                    return;

                case "list":
                    if (isAdmin)                    
                        player.ChatMessage(string.Format(Message("Chat.KitList", player.userID), kitData.Keys.ToSentence()));
                    else
                    {
                        OpenKitGrid(player);
                    }  
                    return;

                case "add":
                case "new":
                    if (!isAdmin)
                    {
                        player.ChatMessage(Message("Chat.Error.NotAdmin", player.userID));
                        return;
                    }
                    _kitCreators[player.userID] = new KitData.Kit();
                    OpenKitsEditor(player);
                    return;

                case "edit":
                    if (!isAdmin)
                    {
                        player.ChatMessage(Message("Chat.Error.NotAdmin", player.userID));
                        return;
                    }
                    if (args.Length != 2)
                    {
                        player.ChatMessage(Message("Chat.Error.NoKit", player.userID));
                        return;
                    }
                    if (!kitData.Find(args[1], out KitData.Kit editKit))
                    {
                        player.ChatMessage(string.Format(Message("Chat.Error.DoesntExist", player.userID), args[1]));
                        return;
                    }
                    _kitCreators[player.userID] = KitData.Kit.CloneOf(editKit);
                    OpenKitsEditor(player);
                    return;

                case "remove":
                case "delete":
                    if (!isAdmin)
                    {
                        player.ChatMessage(Message("Chat.Error.NotAdmin", player.userID));
                        return;
                    }
                    if (args.Length != 2)
                    {
                        player.ChatMessage(Message("Chat.Error.NoKit", player.userID));
                        return;
                    }
                    if (!kitData.Find(args[1], out KitData.Kit deleteKit))
                    {
                        player.ChatMessage(string.Format(Message("Chat.Error.DoesntExist", player.userID), args[1]));
                        return;
                    }
                    kitData.Remove(deleteKit);
                    SaveKitData();
                    player.ChatMessage(string.Format(Message("Chat.KitDeleted", player.userID), args[1]));
                    return;

                default:
                    if (!kitData.Exists(args[0]))
                    {
                        OpenKitGrid(player);
                        return;
                    }

                    if (TryClaimKit(player, args[0], false))
                        player.ChatMessage(string.Format(Message("Notification.KitReceived", player.userID), args[0]));
                    break;
            }
        }

        private void ccmdKit(ConsoleSystem.Arg arg)
        {
            BasePlayer player = arg.Connection?.player as BasePlayer;
            if (player != null && !IsAdmin(player))
                return;

            if (arg.Args == null || arg.Args.Length == 0)
            {
                SendReply(arg, "kit list - List all kits");
                SendReply(arg, "kit delete <kitname> - Delete the specified kit");
                return;
            }

            switch (arg.GetString(0).ToLower())
            {               
                case "list":
                    SendReply(arg, $"Kit List: {kitData.Keys.ToSentence()}");
                    return;

                case "remove":
                case "delete":                    
                    if (arg.Args.Length != 2)
                    {
                        SendReply(arg, "You must specify a kit name");
                        return;
                    }
                    if (!kitData.Find(arg.GetString(1), out KitData.Kit deleteKit))
                    {
                        SendReply(arg, $"The kit {arg.Args[1]} does not exist");
                        return;
                    }
                    kitData.Remove(deleteKit);
                    SaveKitData();
                    SendReply(arg, $"You have deleted the kit {arg.Args[1]}");
                    return;
                
                default:
                    SendReply(arg, "Invalid syntax");
                    break;
            }
        }

        private void ReplyHelp(BasePlayer player)
        {
            player.ChatMessage("<color=#FF8A3D><b>HORIZON VIP</b></color> - O servidor não possui kits pay-to-win.");
            player.ChatMessage("Use <color=#55D6FF>/vip</color> ou <color=#55D6FF>/kit</color> para ver os benefícios de qualidade de vida do VIP.");
        }
        #endregion

        #region Item Shortname Updates
        private void CheckForShortnameUpdates()
        {
            bool hasChanges = false;
            kitData.ForEach(kit =>
            {
                Action<ItemData[]> action = (items =>
                {
                    for (int i = 0; i < items.Length; i++)
                    {
                        ItemData kitItem = items[i];
                        if (_itemShortnameReplacements.TryGetValue(kitItem.Shortname, out string replacement))
                        {
                            kitItem.Shortname = replacement;
                            hasChanges = true;
                        }
                    }
                });
                action(kit.BeltItems);
                action(kit.WearItems);
                action(kit.MainItems);
            });
            if (hasChanges) SaveKitData();
        }
        
        private readonly Dictionary<string, string> _itemShortnameReplacements = new Dictionary<string, string>
        {
            ["chocholate"] = "chocolate"
        };
        #endregion

        #region Config        
        private static ConfigData Configuration;

        private class ConfigData
        {
            [JsonProperty(PropertyName = "Kit chat command")]
            public string Command { get; set; } = "kit";

            [JsonProperty(PropertyName = "Currency used for purchase costs (Scrap, Economics, ServerRewards)")]
            public string Currency { get; set; } = "Scrap";

            [JsonProperty(PropertyName = "Log kits given")]
            public bool LogKitsGiven { get; set; }

            [JsonProperty(PropertyName = "Wipe player data when the server is wiped")]
            public bool WipeData { get; set; }

            [JsonProperty(PropertyName = "Use the Kits UI menu")]
            public bool UseUI { get; set; } = true;

            [JsonProperty(PropertyName = "Only show/give players skins that they are allowed to use (requires PlayerDLCAPI)")]
            public bool OwnedSkins { get; set; } = true;
            
            [JsonProperty(PropertyName = "Allow NPCs to use skins in kits")]
            public bool NPCSkins { get; set; } = true;

            [JsonProperty(PropertyName = "Allow players to toggle auto-kits on spawn")]
            public bool AllowAutoToggle { get; set; }

            [JsonProperty(PropertyName = "Show kits with permissions assigned to players without the permission")]
            public bool ShowPermissionKits { get; set; }

            [JsonProperty(PropertyName = "Players with the admin permission ignore usage restrictions")]
            public bool AdminIgnoreRestrictions { get; set; }

            [JsonProperty(PropertyName = "Autokits ordered by priority")]
            public List<string> AutoKits { get; set; } = new List<string>();

            [JsonProperty(PropertyName = "Post wipe cooldowns (kit name | seconds)")]
            public Hash<string, int> WipeCooldowns { get; set; } = new Hash<string, int>();

            [JsonProperty(PropertyName = "Parameters used when pasting a building via CopyPaste")]
            public string[] CopyPasteParams { get; set; } = new[] { "deployables", "true", "inventories", "true" };

            [JsonProperty(PropertyName = "UI Options")]
            public MenuOptions Menu { get; set; } = new MenuOptions();

            public class MenuOptions
            {
                [JsonProperty(PropertyName = "Panel Color")]
                public UIColor Panel { get; set; } = new UIColor { Hex = "#302725", Alpha = 0.82f };

                [JsonProperty(PropertyName = "Disabled Color")]
                public UIColor Disabled { get; set; } = new UIColor { Hex = "#55504E", Alpha = 0.9f };

                [JsonProperty(PropertyName = "Color 1")]
                public UIColor Color1 { get; set; } = new UIColor { Hex = "#D94B35", Alpha = 1f };

                [JsonProperty(PropertyName = "Color 2")]
                public UIColor Color2 { get; set; } = new UIColor { Hex = "#E34F38", Alpha = 1f };

                [JsonProperty(PropertyName = "Color 3")]
                public UIColor Color3 { get; set; } = new UIColor { Hex = "#E34F38", Alpha = 1f };

                [JsonProperty(PropertyName = "Color 4")]
                public UIColor Color4 { get; set; } = new UIColor { Hex = "#C88B3E", Alpha = 1f };

                [JsonProperty(PropertyName = "Default kit image URL")]
                public string DefaultKitURL { get; set; } = "https://files.rusthq.com/images/kiticon.png";

                [JsonProperty(PropertyName = "View kit icon URL")]
                public string MagnifyIconURL { get; set; } = "https://files.rusthq.com/images/magnifyingglass.png";
            }

            public class UIColor
            {
                public string Hex { get; set; }
                public float Alpha { get; set; }

                [JsonIgnore]
                private string _color;

                [JsonIgnore]
                public string Get
                {
                    get
                    {
                        if (string.IsNullOrEmpty(_color))
                            _color = UI.Color(Hex, Alpha);
                        return _color;
                    }
                }
            }

            public VersionNumber Version { get; set; }
        }

        protected override void LoadConfig()
        {
            base.LoadConfig();
            Configuration = Config.ReadObject<ConfigData>() ?? GetBaseConfig();
            Config.WriteObject(Configuration, true);
        }

        protected override void LoadDefaultConfig() => Configuration = GetBaseConfig();

        private ConfigData GetBaseConfig()
        {
            return new ConfigData
            {
                Command = "kit",                
                Currency = "Scrap",
                LogKitsGiven = false,
                WipeData = false,
                ShowPermissionKits = false,
                UseUI = true,
                AllowAutoToggle = false,
                AutoKits = new List<string>(),
                WipeCooldowns = new Hash<string, int>(),
                CopyPasteParams = new[] { "deployables", "true", "inventories", "true" },
                Menu = new ConfigData.MenuOptions(),
                Version = Version
            };
        }

        protected override void SaveConfig() => Config.WriteObject(Configuration, true);
        #endregion

        #region Data Management
        private KitData kitData;
        private PlayerData playerData;

        private DynamicConfigFile kitdata;
        private DynamicConfigFile playerdata;

        private void SaveKitData() => kitdata.WriteObject(kitData);
        private void SavePlayerData() => playerdata.WriteObject(playerData);

        private void LoadData()
        {
            kitdata = Interface.Oxide.DataFileSystem.GetFile("Kits/kits_data");
            playerdata = Interface.Oxide.DataFileSystem.GetFile("Kits/player_data");

            kitData = kitdata.ReadObject<KitData>();
            playerData = playerdata.ReadObject<PlayerData>();
            
            if (!kitData?.IsValid ?? true)
                kitData = new KitData();

            if (!playerData?.IsValid ?? true)
                playerData = new PlayerData();
        }

        private class KitData
        {
            [JsonProperty]
            private Dictionary<string, Kit> _kits = new Dictionary<string, Kit>(StringComparer.OrdinalIgnoreCase);

            internal Kit this[string key]
            {
                get
                {
                    if (_kits.TryGetValue(key, out Kit tValue))                    
                        return tValue;
                    return null;
                }
                set
                {
                    if (value == null) { _kits.Remove(key); return; }
                    _kits[key] = value;
                }
            }

            internal int Count => _kits.Count;
            internal bool Find(string name, out Kit kit) => _kits.TryGetValue(name, out kit);
            internal bool Exists(string name) => _kits.ContainsKey(name);
            internal ICollection<string> Keys => _kits.Keys;
            internal ICollection<Kit> Values => _kits.Values;

            internal void ForEach(Action<Kit> action)
            {
                foreach(Kit kit in Values) action.Invoke(kit);
            }

            internal void RegisterPermissions(Permission permission, Plugin plugin)
            {
                foreach(Kit kit in _kits.Values)
                {
                    if (!string.IsNullOrEmpty(kit.RequiredPermission))
                    {                        
                        if(!permission.PermissionExists(kit.RequiredPermission, plugin))
                            permission.RegisterPermission(kit.RequiredPermission, plugin);
                    }
                }
            }

            internal void RegisterImages(Plugin plugin)
            {
                Dictionary<string, string> loadOrder = new Dictionary<string, string>
                {
                    [DEFAULT_ICON] = Configuration.Menu.DefaultKitURL,
                    [MAGNIFY_ICON] = Configuration.Menu.MagnifyIconURL
                };

                foreach (Kit kit in _kits.Values)
                {
                    if (!string.IsNullOrEmpty(kit.KitImage))
                        loadOrder.Add(Kits.GetKitImageKey(kit), kit.KitImage);
                }

                plugin?.CallHook("ImportImageList", "Kits", loadOrder, 0UL, true, null);
            }

            internal bool IsOnWipeCooldown(int seconds, out int remaining)
            {
                double currentTime = CurrentTime;
                double nextUseTime = LastWipeTime + seconds;

                if (currentTime < nextUseTime)
                {
                    remaining = Mathf.RoundToInt((float)nextUseTime - (float)currentTime);
                    return true;
                }

                remaining = 0;
                return false;
            }

            internal void Remove(Kit kit) => _kits.Remove(kit.Name);
            internal bool IsValid => _kits != null;

            public class Kit
            {
                public string Name { get; set; } = string.Empty;
                public string Description { get; set; } = string.Empty;
                public string RequiredPermission { get; set; } = string.Empty;

                public int MaximumUses { get; set; }
                public int RequiredAuth { get; set; }
                public int Cooldown { get; set; }
                public int Cost { get; set; }

                public bool IsHidden { get; set; }

                public string CopyPasteFile { get; set; } = string.Empty;
                public string KitImage { get; set; } = string.Empty;

                public ItemData[] MainItems { get; set; } = new ItemData[0];
                public ItemData[] WearItems { get; set; } = new ItemData[0];
                public ItemData[] BeltItems { get; set; } = new ItemData[0];
                
                [JsonIgnore]
                internal int ItemCount => MainItems.Length + WearItems.Length + BeltItems.Length;

                internal static Kit CloneOf(Kit other)
                {
                    Kit kit = new Kit();
                    kit.Name = other.Name;
                    kit.Description = other.Description;
                    kit.RequiredPermission = other.RequiredPermission;
                    kit.MaximumUses = other.MaximumUses;
                    kit.RequiredAuth = other.RequiredAuth;
                    kit.Cooldown = other.Cooldown;
                    kit.Cost = other.Cost;
                    kit.IsHidden = other.IsHidden;
                    kit.CopyPasteFile = other.CopyPasteFile;
                    kit.KitImage = other.KitImage;

                    kit.MainItems = new ItemData[other.MainItems.Length];
                    Array.Copy(other.MainItems, kit.MainItems, other.MainItems.Length);

                    kit.WearItems = new ItemData[other.WearItems.Length];
                    Array.Copy(other.WearItems, kit.WearItems, other.WearItems.Length);

                    kit.BeltItems = new ItemData[other.BeltItems.Length];
                    Array.Copy(other.BeltItems, kit.BeltItems, other.BeltItems.Length);

                    return kit;
                }

                internal bool HasSpaceForItems(BasePlayer player)
                {
                    int wearSpacesFree = 8 - player.inventory.containerWear.itemList.Count;
                    int mainSpacesFree = 24 - player.inventory.containerMain.itemList.Count;
                    int beltSpacesFree = 6 - player.inventory.containerBelt.itemList.Count;

                    return (wearSpacesFree >= WearItems.Length &&
                            beltSpacesFree >= BeltItems.Length &&
                            mainSpacesFree >= MainItems.Length) || ItemCount <= mainSpacesFree + beltSpacesFree;
                }

                internal void GiveItemsTo(BasePlayer player)
                {
                    List<ItemData> list = Pool.Get<List<ItemData>>();

                    GiveItems(player, MainItems, player.inventory.containerMain, ref list);
                    GiveItems(player, WearItems, player.inventory.containerWear, ref list, true);
                    GiveItems(player, BeltItems, player.inventory.containerBelt, ref list);

                    for (int i = 0; i < list.Count; i++)
                    {
                        Item item = CreateItem(list[i], player);
                        if (!MoveToIdealContainer(player.inventory, item) && !item.MoveToContainer(player.inventory.containerMain) && !item.MoveToContainer(player.inventory.containerBelt))                        
                            item.Drop(player.GetDropPosition(), player.GetDropVelocity());                                                
                    }

                    Pool.FreeUnmanaged(ref list);
                }

                private void GiveItems(BasePlayer player, ItemData[] items, ItemContainer container, ref List<ItemData> leftOverItems, bool isWearContainer = false)
                {
                    for (int i = 0; i < items.Length; i++)
                    {
                        ItemData itemData = items[i];
                        if (itemData.Amount < 1) continue;

                        if (container.GetSlot(itemData.Position) != null)
                            leftOverItems.Add(itemData);
                        else
                        {
                            Item item = CreateItem(itemData, player);
                            if (!isWearContainer || (item.info.isWearable && CanWearItem(container, item)))
                            {
                                item.position = itemData.Position;
                                item.SetParent(container);
                            }
                            else
                            {
                                leftOverItems.Add(itemData);
                                item.Remove();
                            }
                        }
                    }
                }

                private bool MoveToIdealContainer(PlayerInventory playerInventory, Item item)
                {
                    if (item.info.isWearable && CanWearItem(playerInventory.containerWear, item))                    
                        return item.MoveToContainer(playerInventory.containerWear, -1, false);
                    
                    if (item.info.stackable > 1)
                    {
                        if (playerInventory.containerBelt?.FindItemByItemID(item.info.itemid) != null)                        
                            return item.MoveToContainer(playerInventory.containerBelt);
                        if (playerInventory.containerMain?.FindItemByItemID(item.info.itemid) != null)                        
                            return item.MoveToContainer(playerInventory.containerMain);
                    }
                    if (item.info.HasFlag(ItemDefinition.Flag.NotStraightToBelt) || !item.info.isUsable)                    
                        return item.MoveToContainer(playerInventory.containerMain);                    

                    return item.MoveToContainer(playerInventory.containerBelt, -1, false); 
                }

                private bool CanWearItem(ItemContainer containerWear, Item item)
                {
                    ItemModWearable itemModWearable = item.info.GetComponent<ItemModWearable>();
                    if (!itemModWearable) return false;
                    for (int i = 0; i < containerWear.itemList.Count; i++)
                    {
                        Item otherItem = containerWear.itemList[i];
                        if (otherItem != null)
                        {
                            ItemModWearable otherModWearable = otherItem.info.GetComponent<ItemModWearable>();                          
                            if (otherModWearable && !itemModWearable.CanExistWith(otherModWearable))
                                return false;
                        }
                    }
                    return true;
                }
                                
                internal void CopyItemsFrom(BasePlayer player)
                {
                    ItemData[] array = MainItems;
                    CopyItems(ref array, player.inventory.containerMain, 24);
                    MainItems = array;

                    array = WearItems;
                    CopyItems(ref array, player.inventory.containerWear, 8);
                    WearItems = array;

                    array = BeltItems;
                    CopyItems(ref array, player.inventory.containerBelt, 6);
                    BeltItems = array;
                }

                private void CopyItems(ref ItemData[] array, ItemContainer container, int limit)
                {
                    limit = Mathf.Min(container.itemList.Count, limit);
                    array = new ItemData[limit];
                    for (int i = 0; i < limit; i++) array[i] = new ItemData(container.itemList[i]);                    
                }

                internal void ClearItems()
                {
                    MainItems = Array.Empty<ItemData>();
                    WearItems = Array.Empty<ItemData>();
                    BeltItems = Array.Empty<ItemData>();
                }
            }
        }

        private class PlayerData
        {
            [JsonProperty]
            private Dictionary<ulong, PlayerUsageData> _players = new Dictionary<ulong, PlayerUsageData>();

            internal bool Find(ulong playerId, out PlayerUsageData playerUsageData) => _players.TryGetValue(playerId, out playerUsageData);
            internal bool Exists(ulong playerId) => _players.ContainsKey(playerId);

            internal PlayerUsageData this[ulong key]
            {
                get
                {
                    if (_players.TryGetValue(key, out PlayerUsageData tValue)) return tValue;
                    tValue = (PlayerUsageData)Activator.CreateInstance(typeof(PlayerUsageData));
                    _players.Add(key, tValue);
                    return tValue;
                }
                set
                {
                    if (value == null) { _players.Remove(key); return; }
                    _players[key] = value;
                }
            }

            internal void OnKitClaimed(BasePlayer player, KitData.Kit kit)
            {
                if (kit.MaximumUses == 0 && kit.Cooldown == 0) return;
                if (!_players.TryGetValue(player.userID, out PlayerUsageData playerUsageData))
                    playerUsageData = _players[player.userID] = new PlayerUsageData();
                playerUsageData.OnKitClaimed(kit);
            }
            
            internal void Wipe() => _players.Clear();
            internal bool IsValid => _players != null;

            public class PlayerUsageData
            {
                [JsonProperty]
                private Hash<string, KitUsageData> _usageData = new Hash<string, KitUsageData>();

                public bool ClaimAutoKits { get; set; } = true;

                internal double GetCooldownRemaining(string name)
                {
                    if (!_usageData.TryGetValue(name, out KitUsageData kitUsageData)) return 0;
                    double currentTime = CurrentTime;
                    return currentTime > kitUsageData.NextUseTime ? 0 : kitUsageData.NextUseTime - CurrentTime;
                }

                internal int GetKitUses(string name)
                {
                    if (!_usageData.TryGetValue(name, out KitUsageData kitUsageData)) return 0;
                    return kitUsageData.TotalUses;
                }

                internal void OnKitClaimed(KitData.Kit kit)
                {
                    if (!_usageData.TryGetValue(kit.Name, out KitUsageData kitUsageData))
                        kitUsageData = _usageData[kit.Name] = new KitUsageData();
                    kitUsageData.OnKitClaimed(kit.Cooldown);
                }

                public class KitUsageData
                {
                    public int TotalUses { get; set; }
                    public double NextUseTime { get; set; }

                    internal void OnKitClaimed(int cooldownSeconds)
                    {
                        TotalUses += 1;
                        NextUseTime = CurrentTime + cooldownSeconds;
                    }
                }
            }            
        }        
        #endregion

        #region Serialized Items
        private static Item CreateItem(ItemData itemData, BasePlayer player = null)
        {
            int itemId = itemData.ItemID;
            ulong skin = itemData.Skin;

            if (player)
            {
                itemId = _getRedirectedIfNotOwned(player, itemData.ItemID);
                skin = _canUseSkin(player, itemData.Skin) ? itemData.Skin : 0UL;
            }

            Item item = ItemManager.CreateByItemID(itemId, itemData.Amount, skin);
            if (!string.IsNullOrEmpty(itemData.DisplayName)) item.name = itemData.DisplayName;
            if (!string.IsNullOrEmpty(itemData.Text)) item.text = itemData.Text;
            item._condition = itemData.Condition;
            item._maxCondition = itemData.MaxCondition;
            item.MarkDirty();
            return item;
        }

        public class ItemData
        {
            public string Shortname { get; set; }
            public string DisplayName { get; set; }
            public ulong Skin { get; set; }
            public int Amount { get; set; }
            public float Condition { get; set; }
            public float MaxCondition { get; set; }
            public int Ammo { get; set; }
            public string Ammotype { get; set; }
            public int Position { get; set; }
            public int Frequency { get; set; }
            public string BlueprintShortname { get; set; }
            public string Text { get; set; }

            [JsonIgnore]
            private int _itemId;

            [JsonIgnore]
            internal int ItemID
            {
                get
                {
                    if (_itemId == 0)
                        _itemId = ItemManager.itemDictionaryByName[Shortname].itemid;
                    return _itemId;
                }
            }

            internal ItemData() {}

            internal ItemData(Item item)
            {
                Shortname = item.info.shortname;
                Amount = item.amount;
                DisplayName = item.name;
                Text = item.text;
                Position = item.position;
                Skin = item.skin;
                Condition = item.condition;
                MaxCondition = item.maxCondition;
            }
        }
        #endregion

        #region Localization
        private string Message(string key, ulong playerId = 0U) => lang.GetMessage(key, this, playerId != 0U ? playerId.ToString() : null);

        private readonly Dictionary<string, string> Messages = new Dictionary<string, string>
        {
            ["Error.EmptyKitName"] = "Nenhum nome de kit especificado",
            ["Error.InvalidKitName"] = "Não existem kits pay-to-win com itens neste servidor.",
            ["Error.CantClaimNow"] = "Não foi possível resgatar neste momento",
            ["Error.CanClaim.Auth"] = "Você não possui autorização para este kit",
            ["Error.CanClaim.Permission"] = "Acesso exclusivo VIP",
            ["Error.CanClaim.Cooldown"] = "Aguarde o tempo de cooldown de {0}",
            ["Error.CanClaim.MaxUses"] = "Você atingiu o limite de usos",
            ["Error.CanClaim.WipeCooldown"] = "Cooldown de wipe restante: {0}",
            ["Error.CanClaim.InventorySpace"] = "Inventário cheio",
            ["Error.CanClaim.InsufficientFunds"] = "Saldo insuficiente",
            ["Error.AutoKitDisabled"] = "Auto-kit desativado",

            ["Cost.Scrap"] = "Scrap",
            ["Cost.ServerRewards"] = "RP",
            ["Cost.Economics"] = "Coins",

            ["Notification.KitReceived"] = "Kit recebido: <color=#ce422b>{0}</color>",

            ["Chat.Error.NotAdmin"] = "Apenas administradores podem usar este comando",
            ["Chat.Error.NoKit"] = "Especifique o nome do kit",
            ["Chat.Error.DoesntExist"] = "O kit <color=#ce422b>{0}</color> não existe",
            ["Chat.KitList"] = "<color=#ce422b>Lista de Kits:</color> {0}",
            ["Chat.KitDeleted"] = "Kit removido: <color=#ce422b>{0}</color>",

            ["UI.Title"] = "Kits & VIP",
            ["UI.Title.Editor"] = "Editor de Kits",
            ["UI.CreateNew"] = "Criar Novo",
            ["UI.SaveKit"] = "Salvar Kit",
            ["UI.Overwrite"] = "Sobrescrever",
            ["UI.ClearItems"] = "Limpar Itens",
            ["UI.CopyInv"] = "Copiar Inventário",
            ["UI.Details"] = "Detalhes",
            ["UI.Name"] = "Nome",
            ["UI.Description"] = "Descrição",
            ["UI.IconURL"] = "URL do Ícone",
            ["UI.UsageAuthority"] = "Permissões",
            ["UI.Permission"] = "Permissão",
            ["UI.AuthLevel"] = "Auth Level",
            ["UI.IsHidden"] = "Oculto",
            ["UI.Usage"] = "Uso",
            ["UI.MaxUses"] = "Máx Usos",
            ["UI.CooldownSeconds"] = "Cooldown (s)",
            ["UI.PurchaseCost"] = "Custo",
            ["UI.CopyPaste"] = "CopyPaste",
            ["UI.FileName"] = "Nome do Arquivo",
            ["UI.KitItems"] = "Itens do Kit",
            ["UI.MainItems"] = "Itens Principais",
            ["UI.WearItems"] = "Vestimentas",
            ["UI.BeltItems"] = "Barra Rápida",

            ["SaveKit.Error.NoName"] = "Digite um nome para o kit",
            ["SaveKit.Error.NoContents"] = "O kit deve conter pelo menos 1 item",
            ["SaveKit.Error.Exists"] = "Já existe um kit com esse nome",
            ["SaveKit.Success"] = "Kit {0} salvo com sucesso",

            ["EditKit.PermissionPrefix"] = "Permissões devem começar com 'kits.'",
            ["EditKit.Number"] = "Insira um número válido",
            ["EditKit.Bool"] = "Insira true ou false"
        };
        #endregion
    }
}
