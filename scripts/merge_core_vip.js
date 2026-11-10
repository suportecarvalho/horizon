const fs = require('fs');

const coreCode = fs.readFileSync('HorizonCore.cs', 'utf8');
const vipCode = fs.readFileSync('HorizonVIP.cs', 'utf8');

// Let's create the unified HorizonCore v3.0.0
const unified = `using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries;
using Oxide.Core.Plugins;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("HorizonCore", "RustHorizon", "3.0.0")]
    [Description("Plugin Mestre Unificado: Status do Servidor em Tempo Real, Leaderboards (PvP, Recursos, Farming, Raid) e Sistema Completo de VIPs")]
    public class HorizonCore : RustPlugin
    {
        [PluginReference]
        private Plugin ImageLibrary;

        private Configuration config;
        private StoredData data;

        // Timers de sincronização
        private Timer statusTimer;
        private Timer debounceStatusTimer;
        private Timer leaderboardTimer;
        private Timer vipSyncTimer;
        private Timer vipExpiryTimer;

        // Cache em memória de avatares já buscados nesta sessão (steamid → url)
        private readonly Dictionary<string, string> avatarCache = new Dictionary<string, string>();

        // Rastreamento de quem derrubou (wounded) cada jogador para creditar o kill se ele sangrar ou der F1 kill
        private readonly Dictionary<ulong, ulong> lastWoundAttacker = new Dictionary<ulong, ulong>();

        // -------------------------------------------------------------
        // CONFIGURAÇÃO UNIFICADA (STATUS + LEADERBOARDS + VIPS)
        // -------------------------------------------------------------
        public class Configuration
        {
            // === MÓDULO 1: STATUS DO SERVIDOR ===
            [JsonProperty("Status_UrlDaApiDoSite")]
            public string StatusApiUrl { get; set; } = "https://lojahorizon.vercel.app/api/status";

            [JsonProperty("Status_IntervaloSegundos")]
            public int StatusSyncIntervalSeconds { get; set; } = 30;

            [JsonProperty("Status_ApiKey")]
            public string ApiKey { get; set; } = "horizon_live_server_secret";

            [JsonProperty("Status_CronogramaWipeMapa")]
            public string MapWipeSchedule { get; set; } = "Toda Sexta às 18:00h";

            [JsonProperty("Status_CronogramaWipeFull")]
            public string FullWipeSchedule { get; set; } = "1ª Quinta-feira do mês às 17:00h";

            [JsonProperty("Status_NomeDoServidor")]
            public string ServerName { get; set; } = "[BR/LATAM] HORIZON 2X | SOLO/DUO/TRIO/QUAD";

            [JsonProperty("Status_LimitePorTime")]
            public string TeamLimit { get; set; } = "(Max 4)";

            // === MÓDULO 2: LEADERBOARD & ESTATÍSTICAS ===
            [JsonProperty("Leaderboard_UrlDaApiDoSite")]
            public string LeaderboardApiUrl { get; set; } = "https://lojahorizon.vercel.app/api/leaderboard";

            [JsonProperty("Leaderboard_IntervaloMinutos")]
            public int LeaderboardSyncIntervalMinutes { get; set; } = 5;

            [JsonProperty("Leaderboard_LimiteJogadoresPorAba")]
            public int TopPlayersLimit { get; set; } = 100;

            // === MÓDULO 3: VIPS & LOJA AUTOMÁTICA (MERCADO PAGO) ===
            [JsonProperty("Vip_Habilitado")]
            public bool VipEnabled { get; set; } = true;

            [JsonProperty("Vip_ApiBaseUrl")]
            public string VipApiBaseUrl { get; set; } = "https://lojahorizon.vercel.app";

            [JsonProperty("Vip_IntervaloSegundos")]
            public int VipSyncIntervalSeconds { get; set; } = 30;

            [JsonProperty("Vip_CriarGruposAutomaticamente")]
            public bool VipAutoCreateGroups { get; set; } = true;

            [JsonProperty("Vip_Grupos")]
            public Dictionary<string, string> VipGroups { get; set; } = new Dictionary<string, string>
            {
                { "bronze", "vip_bronze" },
                { "prata", "vip_prata" },
                { "ouro", "vip_ouro" }
            };

            [JsonProperty("Vip_PermissoesPorTier")]
            public Dictionary<string, List<string>> VipTierPermissions { get; set; } = new Dictionary<string, List<string>>
            {
                { "bronze", new List<string> { "kits.vipbronze", "skippriority.vip" } },
                { "prata", new List<string> { "kits.vipprata", "skippriority.vip" } },
                { "ouro", new List<string> { "kits.vipouro", "skippriority.vip" } }
            };

            [JsonProperty("Vip_ComandosAoAtivar")]
            public Dictionary<string, List<string>> VipActivationCommands { get; set; } = new Dictionary<string, List<string>>
            {
                { "bronze", new List<string>() },
                { "prata", new List<string>() },
                { "ouro", new List<string>() }
            };

            [JsonProperty("Vip_PrefixoChat")]
            public string VipChatPrefix { get; set; } = "<color=#D7573B>[HORIZON VIP]</color>";

            // === GERAL ===
            [JsonProperty("LogarNoConsole")]
            public bool LogToConsole { get; set; } = false;
        }

        // -------------------------------------------------------------
        // DADOS DO LEADERBOARD (PvP, Recursos, Farming, Raid)
        // -------------------------------------------------------------
        public class PlayerStats
        {
            public string Name { get; set; } = "";
            public string SteamId { get; set; } = "";
            public string Avatar { get; set; } = "";

            // PvP
            public int Kills { get; set; } = 0;
            public int Deaths { get; set; } = 0;
            public int Headshots { get; set; } = 0;
            public float MaxKillDistance { get; set; } = 0f;

            // Recursos (8 itens)
            public int Stone { get; set; } = 0;          // stones
            public int Sulfur { get; set; } = 0;         // sulfur.ore
            public int Metal { get; set; } = 0;          // metal.ore
            public int HQM { get; set; } = 0;            // hq.metal.ore
            public int Wood { get; set; } = 0;           // wood
            public int Leather { get; set; } = 0;        // leather
            public int Fat { get; set; } = 0;            // fat.animal
            public int Bone { get; set; } = 0;           // bone.fragments

            // Farming (12 itens)
            public int Cloth { get; set; } = 0;          // cloth
            public int YellowBerry { get; set; } = 0;    // yellow.berry
            public int RedBerry { get; set; } = 0;       // red.berry
            public int BlueBerry { get; set; } = 0;      // blue.berry
            public int GreenBerry { get; set; } = 0;     // green.berry
            public int WhiteBerry { get; set; } = 0;     // white.berry
            public int Mushroom { get; set; } = 0;       // mushroom
            public int Pumpkin { get; set; } = 0;        // pumpkin
            public int Corn { get; set; } = 0;           // corn
            public int Potato { get; set; } = 0;         // potato
            public int Wheat { get; set; } = 0;          // wheat
            public int Egg { get; set; } = 0;            // egg

            // Raid (Explosivos usados)
            public int RocketsUsed { get; set; } = 0;
            public int C4Used { get; set; } = 0;
            public int SatchelsUsed { get; set; } = 0;
            public int StructuresDestroyed { get; set; } = 0;
            public int DoorsDestroyed { get; set; } = 0;
        }

        // -------------------------------------------------------------
        // DADOS DO SISTEMA VIP
        // -------------------------------------------------------------
        public class VipRecord
        {
            public string SteamId { get; set; } = "";
            public string PlayerName { get; set; } = "";
            public string Tier { get; set; } = "";
            public string OrderId { get; set; } = "";
            public DateTime ActivatedAt { get; set; }
            public DateTime ExpiresAt { get; set; }
            public bool IsActive { get; set; } = true;
        }

        public class StoredData
        {
            public Dictionary<string, PlayerStats> Players { get; set; } = new Dictionary<string, PlayerStats>();
            public Dictionary<string, VipRecord> ActiveVips { get; set; } = new Dictionary<string, VipRecord>();
            public List<VipRecord> ExpiredHistory { get; set; } = new List<VipRecord>();
            public HashSet<string> ProcessedOrders { get; set; } = new HashSet<string>();
        }

        // Payloads de entrega da API VIP
        public class PendingDelivery
        {
            public string orderId { get; set; }
            public string steamId { get; set; }
            public string playerName { get; set; }
            public string vipTier { get; set; }
            public int durationDays { get; set; }
            public string kitPermission { get; set; }
            public string expiresAt { get; set; }
        }

        public class PendingResponse
        {
            public bool success { get; set; }
            public List<PendingDelivery> deliveries { get; set; }
        }

        // -------------------------------------------------------------
        // CARREGAMENTO E SALVAMENTO DE CONFIGURAÇÃO
        // -------------------------------------------------------------
        protected override void LoadDefaultConfig()
        {
            config = new Configuration();
            SaveConfig();
        }

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try
            {
                config = Config.ReadObject<Configuration>();
                if (config == null) LoadDefaultConfig();
            }
            catch
            {
                LoadDefaultConfig();
            }
        }

        protected override void SaveConfig()
        {
            Config.WriteObject(config, true);
        }

        private void SaveData()
        {
            // Salva dados unificados sob HorizonCore e mantém espelho em HorizonLeaderboards / HorizonVIP
            Interface.Oxide.DataFileSystem.WriteObject("HorizonCore", data);
            Interface.Oxide.DataFileSystem.WriteObject("HorizonLeaderboards", new { Players = data.Players });
            Interface.Oxide.DataFileSystem.WriteObject("HorizonVIP", new {
                ActiveVips = data.ActiveVips,
                ExpiredHistory = data.ExpiredHistory,
                ProcessedOrders = data.ProcessedOrders
            });
        }

        // -------------------------------------------------------------
        // INICIALIZAÇÃO E FINALIZAÇÃO
        // -------------------------------------------------------------
        private void Loaded()
        {
            LoadConfig();

            // Carrega dados persistidos (tenta HorizonCore primeiro, depois migra de HorizonLeaderboards / HorizonVIP)
            data = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonCore");
            if (data == null)
            {
                data = new StoredData();
            }
            if (data.Players == null) data.Players = new Dictionary<string, PlayerStats>();
            if (data.ActiveVips == null) data.ActiveVips = new Dictionary<string, VipRecord>();
            if (data.ExpiredHistory == null) data.ExpiredHistory = new List<VipRecord>();
            if (data.ProcessedOrders == null) data.ProcessedOrders = new HashSet<string>();

            // Migração transparente de arquivos legados de dados
            try
            {
                var legacyLb = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonLeaderboards");
                if (legacyLb != null && legacyLb.Players != null && legacyLb.Players.Count > 0)
                {
                    foreach (var kv in legacyLb.Players)
                    {
                        if (!data.Players.ContainsKey(kv.Key)) data.Players[kv.Key] = kv.Value;
                    }
                }
            }
            catch {}

            try
            {
                var legacyVip = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonVIP");
                if (legacyVip != null && legacyVip.ActiveVips != null && legacyVip.ActiveVips.Count > 0)
                {
                    foreach (var kv in legacyVip.ActiveVips)
                    {
                        if (!data.ActiveVips.ContainsKey(kv.Key)) data.ActiveVips[kv.Key] = kv.Value;
                    }
                    if (legacyVip.ProcessedOrders != null)
                    {
                        foreach (var ord in legacyVip.ProcessedOrders) data.ProcessedOrders.Add(ord);
                    }
                }
            }
            catch {}

            // Comandos de Chat
            cmd.AddChatCommand("ranking", this, nameof(CmdChatRank));
            cmd.AddChatCommand("top", this, nameof(CmdChatRank));
            cmd.AddChatCommand("vip", this, nameof(CmdChatVip));
        }

        private void OnServerInitialized()
        {
            // === 1. MÓDULO STATUS ===
            timer.Once(3f, () => SyncServerStatus("Inicialização do Servidor"));
            int statusInterval = Math.Max(15, config.StatusSyncIntervalSeconds);
            statusTimer = timer.Every(statusInterval, () => SyncServerStatus("Rotina Periódica"));

            // === 2. MÓDULO LEADERBOARD ===
            int lbInterval = Math.Max(1, config.LeaderboardSyncIntervalMinutes);
            leaderboardTimer = timer.Every(lbInterval * 60f, SendLeaderboardToWeb);
            timer.Once(6f, SendLeaderboardToWeb);

            // === 3. MÓDULO VIP ===
            if (config.VipEnabled)
            {
                if (config.VipAutoCreateGroups)
                {
                    foreach (var kv in config.VipGroups)
                    {
                        if (!permission.GroupExists(kv.Value))
                        {
                            permission.CreateGroup(kv.Value, kv.Value, 0);
                            Puts($"[HorizonCore] Grupo Oxide '{kv.Value}' criado automaticamente.");
                        }
                    }
                }

                int vipInterval = Math.Max(10, config.VipSyncIntervalSeconds);
                vipSyncTimer = timer.Every(vipInterval, CheckPendingDeliveries);
                vipExpiryTimer = timer.Every(300f, CheckVipExpirations);

                // Verificação inicial
                timer.Once(5f, CheckPendingDeliveries);
                CheckVipExpirations();
            }

            Puts($"=============================================================");
            Puts($"[HorizonCore v3.0.0] Plugin MESTRE inicializado com sucesso!");
            Puts($"• Status do Servidor: '{config.StatusApiUrl}' ({statusInterval}s)");
            Puts($"• Leaderboards & PvP: '{config.LeaderboardApiUrl}' ({lbInterval}m, {data.Players.Count} players)");
            Puts($"• Sistema de VIPs:    '{config.VipApiBaseUrl}' (Ativo: {config.VipEnabled}, {data.ActiveVips.Count} VIPs)");
            Puts($"=============================================================");

            // Buscar avatares pendentes de jogadores já registrados
            foreach (var kv in data.Players)
            {
                if (string.IsNullOrEmpty(kv.Value.Avatar))
                {
                    FetchSteamAvatar(kv.Key, kv.Value);
                }
            }
        }

        private void OnServerShutdown()
        {
            statusTimer?.Destroy();
            debounceStatusTimer?.Destroy();
            leaderboardTimer?.Destroy();
            vipSyncTimer?.Destroy();
            vipExpiryTimer?.Destroy();

            SyncServerStatus("Servidor Desligando / Reiniciando");
            SendLeaderboardToWeb();
            SaveData();
        }

        private void Unload()
        {
            statusTimer?.Destroy();
            debounceStatusTimer?.Destroy();
            leaderboardTimer?.Destroy();
            vipSyncTimer?.Destroy();
            vipExpiryTimer?.Destroy();

            SaveData();
        }
`;

// Now let's extract the rest of HorizonCore (starting from OnNewSave) and inject the VIP methods
const marker = 'private void OnNewSave(string filename)';
const idxMarker = coreCode.indexOf(marker);

// Find end of HorizonCore console commands (before closing brace)
// Let's see the end of HorizonCore.cs
const lastBraceIdx = coreCode.lastIndexOf('}');
const secondLastBraceIdx = coreCode.lastIndexOf('}', lastBraceIdx - 1);

const coreRest = coreCode.slice(idxMarker, secondLastBraceIdx);

// VIP specific methods to inject into HorizonCore
const vipMethods = `
        // =========================================================================
        // MÓDULO VIP: SISTEMA DE ENTREGA E EXPIRAÇÃO
        // =========================================================================

        private void CheckPendingDeliveries()
        {
            if (!config.VipEnabled) return;

            string url = $"{config.VipApiBaseUrl.TrimEnd('/')}/api/vip/pending";

            webrequest.Enqueue(url, null, (code, response) =>
            {
                if (code != 200 || string.IsNullOrEmpty(response))
                {
                    return;
                }

                try
                {
                    var result = JsonConvert.DeserializeObject<PendingResponse>(response);
                    if (result != null && result.deliveries != null && result.deliveries.Count > 0)
                    {
                        Puts($"[HorizonVIP] {result.deliveries.Count} entrega(s) pendente(s) encontrada(s). Processando...");
                        foreach (var delivery in result.deliveries)
                        {
                            GrantVip(delivery);
                        }
                    }
                }
                catch (Exception ex)
                {
                    PrintError($"[HorizonVIP] Erro ao processar entregas pendentes: {ex.Message}");
                }
            }, this, RequestMethod.GET, new Dictionary<string, string> { { "User-Agent", "HorizonCore-Rust" } });
        }

        private void GrantVip(PendingDelivery delivery)
        {
            if (delivery == null || string.IsNullOrEmpty(delivery.steamId)) return;

            if (!string.IsNullOrEmpty(delivery.orderId) && data.ProcessedOrders.Contains(delivery.orderId))
            {
                ConfirmDelivery(delivery.orderId);
                return;
            }

            string steamId = delivery.steamId;
            string tier = (delivery.vipTier ?? "bronze").ToLower();
            string groupName = config.VipGroups.ContainsKey(tier) ? config.VipGroups[tier] : $"vip_{tier}";

            if (!permission.GroupExists(groupName))
            {
                permission.CreateGroup(groupName, groupName, 0);
            }

            permission.AddUserGroup(steamId, groupName);

            if (config.VipTierPermissions.ContainsKey(tier))
            {
                foreach (var perm in config.VipTierPermissions[tier])
                {
                    if (!string.IsNullOrEmpty(perm))
                    {
                        permission.GrantUserPermission(steamId, perm, null);
                    }
                }
            }

            if (!string.IsNullOrEmpty(delivery.kitPermission))
            {
                permission.GrantUserPermission(steamId, delivery.kitPermission, null);
            }

            DateTime expiresAt;
            if (!string.IsNullOrEmpty(delivery.expiresAt) && DateTime.TryParse(delivery.expiresAt, out var parsedExpires))
            {
                expiresAt = parsedExpires.ToUniversalTime();
            }
            else
            {
                expiresAt = DateTime.UtcNow.AddDays(delivery.durationDays > 0 ? delivery.durationDays : 30);
            }

            if (data.ActiveVips.TryGetValue(steamId, out var existingVip) && existingVip.IsActive && existingVip.Tier == tier && existingVip.ExpiresAt > DateTime.UtcNow)
            {
                expiresAt = existingVip.ExpiresAt.AddDays(delivery.durationDays > 0 ? delivery.durationDays : 30);
            }

            var record = new VipRecord
            {
                SteamId = steamId,
                PlayerName = delivery.playerName ?? "Jogador",
                Tier = tier,
                OrderId = delivery.orderId ?? "",
                ActivatedAt = DateTime.UtcNow,
                ExpiresAt = expiresAt,
                IsActive = true
            };

            data.ActiveVips[steamId] = record;
            if (!string.IsNullOrEmpty(delivery.orderId))
            {
                data.ProcessedOrders.Add(delivery.orderId);
            }
            SaveData();

            if (config.VipActivationCommands.ContainsKey(tier))
            {
                foreach (var cmd in config.VipActivationCommands[tier])
                {
                    if (!string.IsNullOrEmpty(cmd))
                    {
                        ConsoleSystem.Run(ConsoleSystem.Option.Server, cmd.Replace("{steamid}", steamId).Replace("{player}", delivery.playerName ?? ""));
                    }
                }
            }

            string tierFormatado = char.ToUpper(tier[0]) + tier.Substring(1);
            PrintToChat($"{config.VipChatPrefix} O jogador <color=#10B981>{record.PlayerName}</color> adquiriu o pacote <color=#F59E0B>VIP {tierFormatado}</color>! Agradecemos pelo apoio!");

            BasePlayer player = BasePlayer.Find(steamId);
            if (player != null && player.IsConnected)
            {
                PrintToChat(player, $"{config.VipChatPrefix} <color=#10B981>Parabéns!</color> Seu <color=#F59E0B>VIP {tierFormatado}</color> foi ativado com sucesso!\\n" +
                                   $"- Validade: <color=#38BDF8>30 dias</color> (Expira em: {expiresAt.ToLocalTime():dd/MM/yyyy HH:mm})\\n" +
                                   $"- Use <color=#F59E0B>/kit</color> para resgatar seus itens e aproveite a fila prioritária!");
            }

            Puts($"[HorizonVIP] ✔ VIP {tierFormatado} concedido com sucesso para {record.PlayerName} ({steamId}) por 30 dias (até {expiresAt:yyyy-MM-dd HH:mm}).");

            ConfirmDelivery(delivery.orderId);
        }

        private void ConfirmDelivery(string orderId)
        {
            if (string.IsNullOrEmpty(orderId)) return;

            string url = $"{config.VipApiBaseUrl.TrimEnd('/')}/api/vip/confirm";
            string body = JsonConvert.SerializeObject(new { orderId = orderId });

            webrequest.Enqueue(url, body, (code, response) =>
            {
                if (code == 200)
                {
                    Puts($"[HorizonVIP] Entrega do pedido '{orderId}' confirmada com sucesso na API.");
                }
                else
                {
                    Puts($"[HorizonVIP] Aviso: Resposta {code} ao confirmar pedido {orderId} na API.");
                }
            }, this, RequestMethod.POST, new Dictionary<string, string> { { "Content-Type", "application/json" } });
        }

        private void CheckVipExpirations()
        {
            if (!config.VipEnabled || data == null || data.ActiveVips == null || data.ActiveVips.Count == 0) return;

            var toRemove = new List<string>();
            DateTime now = DateTime.UtcNow;

            foreach (var kv in data.ActiveVips)
            {
                var record = kv.Value;
                if (record == null) continue;

                if (now >= record.ExpiresAt)
                {
                    toRemove.Add(kv.Key);
                }
            }

            foreach (var steamId in toRemove)
            {
                RevokeVip(steamId, "Prazo de 30 dias expirado");
            }
        }

        public void RevokeVip(string steamId, string motivo = "Expirado")
        {
            if (!data.ActiveVips.TryGetValue(steamId, out var record)) return;

            string groupName = config.VipGroups.ContainsKey(record.Tier) ? config.VipGroups[record.Tier] : $"vip_{record.Tier}";

            if (permission.GroupExists(groupName) && permission.UserHasGroup(steamId, groupName))
            {
                permission.RemoveUserGroup(steamId, groupName);
            }

            if (config.VipTierPermissions.ContainsKey(record.Tier))
            {
                foreach (var perm in config.VipTierPermissions[record.Tier])
                {
                    if (!string.IsNullOrEmpty(perm))
                    {
                        permission.RevokeUserPermission(steamId, perm);
                    }
                }
            }

            record.IsActive = false;
            data.ActiveVips.Remove(steamId);
            data.ExpiredHistory.Add(record);
            SaveData();

            Puts($"[HorizonVIP] VIP de {record.PlayerName} ({steamId}) foi removido. Motivo: {motivo}");

            BasePlayer player = BasePlayer.Find(steamId);
            if (player != null && player.IsConnected)
            {
                PrintToChat(player, $"{config.VipChatPrefix} Seu plano <color=#F59E0B>VIP {record.Tier.ToUpper()}</color> expirou. Renove em: <color=#38BDF8>{config.VipApiBaseUrl}/loja</color>");
            }
        }

        // -------------------------------------------------------------
        // COMANDOS DE CHAT E CONSOLE PARA VIPS
        // -------------------------------------------------------------
        [ChatCommand("vip")]
        private void CmdChatVip(BasePlayer player, string command, string[] args)
        {
            if (player == null) return;
            string id = player.UserIDString;

            if (args.Length > 0 && args[0].ToLower() == "resgatar")
            {
                PrintToChat(player, $"{config.VipChatPrefix} Verificando pagamentos e resgates no Mercado Pago...");
                CheckPendingDeliveries();
                return;
            }

            if (data.ActiveVips.TryGetValue(id, out var vip) && vip.IsActive && vip.ExpiresAt > DateTime.UtcNow)
            {
                var remaining = vip.ExpiresAt - DateTime.UtcNow;
                string tierFormatado = char.ToUpper(vip.Tier[0]) + vip.Tier.Substring(1);

                PrintToChat(player, $"{config.VipChatPrefix} <color=#10B981>=== SEU STATUS VIP ===</color>\\n" +
                                   $"- Pacote: <color=#F59E0B>VIP {tierFormatado}</color>\\n" +
                                   $"- Tempo Restante: <color=#38BDF8>{remaining.Days} dias, {remaining.Hours} horas e {remaining.Minutes} minutos</color>\\n" +
                                   $"- Expira em: <color=#E2E8F0>{vip.ExpiresAt.ToLocalTime():dd/MM/yyyy HH:mm}</color>\\n" +
                                   $"- Resgatar itens: digite <color=#F59E0B>/kit</color>");
            }
            else
            {
                PrintToChat(player, $"{config.VipChatPrefix} Você não possui nenhum pacote VIP ativo no momento.\\n" +
                                   $"Adquira seu VIP com ativação imediata via PIX em: <color=#38BDF8>{config.VipApiBaseUrl}/loja</color>\\n" +
                                   $"Se você acabou de pagar, digite <color=#F59E0B>/vip resgatar</color> para forçar a verificação.");
            }
        }

        [ConsoleCommand("vip.grant")]
        private void CmdVipGrant(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin) return;
            if (arg.Args == null || arg.Args.Length < 2)
            {
                arg.ReplyWith("Uso: vip.grant <steamid> <bronze|prata|ouro> [dias]");
                return;
            }

            string steamId = arg.GetString(0);
            string tier = (arg.GetString(1) ?? "bronze").ToLower();
            int dias = arg.GetInt(2, 30);

            GrantVip(new PendingDelivery
            {
                orderId = $"MANUAL-{DateTime.UtcNow:yyyyMMddHHmmss}",
                steamId = steamId,
                playerName = "Jogador",
                vipTier = tier,
                durationDays = dias
            });

            arg.ReplyWith($"[HorizonCore] VIP {tier} concedido manualmente para {steamId} por {dias} dias.");
        }

        [ConsoleCommand("vip.revoke")]
        private void CmdVipRevoke(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin) return;
            if (arg.Args == null || arg.Args.Length < 1)
            {
                arg.ReplyWith("Uso: vip.revoke <steamid>");
                return;
            }

            string steamId = arg.GetString(0);
            RevokeVip(steamId, "Revogado por Admin no console");
            arg.ReplyWith($"[HorizonCore] VIP de {steamId} revogado com sucesso.");
        }

        [ConsoleCommand("vip.list")]
        private void CmdVipList(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin) return;
            arg.ReplyWith($"=== VIPs ATIVOS NO HORIZON ({data.ActiveVips.Count}) ===");
            foreach (var kv in data.ActiveVips)
            {
                var v = kv.Value;
                var rest = v.ExpiresAt - DateTime.UtcNow;
                string expStr = v.ExpiresAt.ToLocalTime().ToString("dd/MM/yyyy HH:mm");
                arg.ReplyWith($"• {v.PlayerName} ({v.SteamId}) | {v.Tier.ToUpper()} | Restam: {rest.Days}d {rest.Hours}h (Expira: {expStr})");
            }
        }
`;

const finalCode = unified + coreRest + vipMethods + "\n    }\n}\n";

fs.writeFileSync('HorizonCore.cs', finalCode, 'utf8');
console.log('Successfully wrote unified HorizonCore.cs (v3.0.0)! Total lines:', finalCode.split('\n').length);

