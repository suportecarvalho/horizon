using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries;
using Oxide.Core.Plugins;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("HorizonVIP", "RustHorizon", "1.0.0")]
    [Description("Entrega automática de VIPs do Mercado Pago com remoção automática após 30 dias")]
    public class HorizonVIP : RustPlugin
    {
        private Configuration config;
        private StoredData data;

        public class Configuration
        {
            [JsonProperty("ApiBaseUrl")]
            public string ApiBaseUrl { get; set; } = "https://lojahorizon.vercel.app";

            [JsonProperty("IntervaloSincronizacaoSegundos")]
            public int SyncIntervalSeconds { get; set; } = 30;

            [JsonProperty("CriarGruposOxideAutomaticamente")]
            public bool AutoCreateGroups { get; set; } = true;

            [JsonProperty("GruposVip")]
            public Dictionary<string, string> VipGroups { get; set; } = new Dictionary<string, string>
            {
                { "bronze", "vip_bronze" },
                { "prata", "vip_prata" },
                { "ouro", "vip_ouro" }
            };

            [JsonProperty("PermissoesPorTier")]
            public Dictionary<string, List<string>> TierPermissions { get; set; } = new Dictionary<string, List<string>>
            {
                { "bronze", new List<string> { "kits.vipbronze", "skippriority.vip" } },
                { "prata", new List<string> { "kits.vipprata", "skippriority.vip" } },
                { "ouro", new List<string> { "kits.vipouro", "skippriority.vip" } }
            };

            [JsonProperty("ComandosAoAtivar")]
            public Dictionary<string, List<string>> ActivationCommands { get; set; } = new Dictionary<string, List<string>>
            {
                { "bronze", new List<string>() },
                { "prata", new List<string>() },
                { "ouro", new List<string>() }
            };

            [JsonProperty("PrefixoChat")]
            public string ChatPrefix { get; set; } = "<color=#D7573B>[HORIZON VIP]</color>";
        }

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
            public Dictionary<string, VipRecord> ActiveVips { get; set; } = new Dictionary<string, VipRecord>();
            public List<VipRecord> ExpiredHistory { get; set; } = new List<VipRecord>();
            public HashSet<string> ProcessedOrders { get; set; } = new HashSet<string>();
        }

        public class PendingDelivery
        {
            public string orderId { get; set; }
            public string paymentId { get; set; }
            public string steamId { get; set; }
            public string playerName { get; set; }
            public string vipTier { get; set; }
            public string groupName { get; set; }
            public string kitPermission { get; set; }
            public string expiresAt { get; set; }
            public int durationDays { get; set; }
        }

        public class PendingResponse
        {
            public bool success { get; set; }
            public int count { get; set; }
            public List<PendingDelivery> deliveries { get; set; }
        }

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

        private void Loaded()
        {
            data = Interface.Oxide.DataFileSystem.ReadObject<StoredData>("HorizonVIP");
            if (data == null || data.ActiveVips == null)
            {
                data = new StoredData();
            }
            if (data.ProcessedOrders == null)
            {
                data.ProcessedOrders = new HashSet<string>();
            }

            // Garante que os grupos Oxide existam
            if (config.AutoCreateGroups)
            {
                foreach (var kv in config.VipGroups)
                {
                    if (!permission.GroupExists(kv.Value))
                    {
                        permission.CreateGroup(kv.Value, kv.Value, 0);
                        Puts($"[HorizonVIP] Grupo Oxide '{kv.Value}' criado automaticamente.");
                    }
                }
            }

            // Timer de sincronização de novos pedidos (Mercado Pago)
            timer.Every(config.SyncIntervalSeconds, CheckPendingDeliveries);

            // Timer de expiração (verifica VIPs vencidos a cada 5 minutos)
            timer.Every(300f, CheckVipExpirations);

            // Verifica expirações imediatamente ao carregar
            CheckVipExpirations();

            Puts($"[HorizonVIP] Plugin iniciado com sucesso! Monitorando entregas em {config.ApiBaseUrl} a cada {config.SyncIntervalSeconds}s.");
            Puts($"[HorizonVIP] VIPs ativos registrados neste momento: {data.ActiveVips.Count}");
        }

        private void Unload()
        {
            SaveData();
        }

        private void SaveData()
        {
            Interface.Oxide.DataFileSystem.WriteObject("HorizonVIP", data);
        }

        // ---------------------------------------------------------------
        // BUSCA ENTREGAS PENDENTES NA API
        // ---------------------------------------------------------------
        private void CheckPendingDeliveries()
        {
            string url = $"{config.ApiBaseUrl.TrimEnd('/')}/api/vip/pending";

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
                        foreach (var delivery in result.deliveries)
                        {
                            GrantVip(delivery);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Puts($"[HorizonVIP] Erro ao processar entregas pendentes: {ex.Message}");
                }
            }, this, RequestMethod.GET);
        }

        // ---------------------------------------------------------------
        // CONCEDE VIP AO JOGADOR (30 DIAS)
        // ---------------------------------------------------------------
        public void GrantVip(PendingDelivery delivery)
        {
            if (delivery == null || string.IsNullOrEmpty(delivery.steamId)) return;

            // Evita processamento duplicado ou spam caso a API ainda não tenha persistido a confirmação
            if (!string.IsNullOrEmpty(delivery.orderId) && data.ProcessedOrders.Contains(delivery.orderId))
            {
                ConfirmDelivery(delivery.orderId);
                return;
            }

            string steamId = delivery.steamId;
            string tier = (delivery.vipTier ?? "bronze").ToLower().Trim();
            if (tier == "sobrevivente" || tier == "vip_sobrevivente" || tier == "vip-sobrevivente" || tier == "vip_bronze" || tier == "vip-bronze" || tier == "vipbronze") tier = "bronze";
            if (tier == "vip_prata" || tier == "vip-prata" || tier == "vipprata") tier = "prata";
            if (tier == "vip_ouro" || tier == "vip-ouro" || tier == "vipouro") tier = "ouro";
            if (tier == "kit-farmer" || tier == "kit_farmer") tier = "farmer";
            if (tier == "kit-airdrop" || tier == "kit_airdrop" || tier == "drop" || tier == "kit-drop") tier = "airdrop";
            if (tier == "kit-cartao" || tier == "kit_cartao" || tier == "cards" || tier == "cartoes") tier = "cartao";
            if (tier == "kit-eletrica" || tier == "kit_eletrica" || tier == "eletrico") tier = "eletrica";

            // Localiza jogador para obter o nome real no jogo
            BasePlayer player = null;
            if (ulong.TryParse(steamId, out ulong parsedUserId))
            {
                player = BasePlayer.FindByID(parsedUserId);
                if (player == null) player = BasePlayer.FindSleeping(parsedUserId);
            }
            if (player == null) player = BasePlayer.Find(steamId);

            string finalPlayerName = (player != null && !string.IsNullOrEmpty(player.displayName))
                ? player.displayName
                : (!string.IsNullOrEmpty(delivery.playerName) && delivery.playerName != "Jogador" ? delivery.playerName : "Jogador");

            string groupName = !string.IsNullOrEmpty(delivery.groupName)
                ? delivery.groupName
                : (config.VipGroups.ContainsKey(tier) ? config.VipGroups[tier] : $"vip_{tier}");

            // Garante que o grupo existe
            if (!permission.GroupExists(groupName))
            {
                permission.CreateGroup(groupName, groupName, 0);
            }

            // Adiciona o jogador ao grupo Oxide correspondente
            permission.AddUserGroup(steamId, groupName);

            // Concede permissões específicas do Tier
            if (config.TierPermissions.ContainsKey(tier))
            {
                foreach (var perm in config.TierPermissions[tier])
                {
                    if (!string.IsNullOrEmpty(perm))
                    {
                        permission.GrantUserPermission(steamId, perm, null);
                    }
                }
            }

            // Permissão extra vinda da API se houver
            if (!string.IsNullOrEmpty(delivery.kitPermission))
            {
                permission.GrantUserPermission(steamId, delivery.kitPermission, null);
            }

            // Calcula prazo de expiração (30 dias padrão ou data da API)
            DateTime expiresAt;
            if (!string.IsNullOrEmpty(delivery.expiresAt) && DateTime.TryParse(delivery.expiresAt, out var parsedExpires))
            {
                expiresAt = parsedExpires.ToUniversalTime();
            }
            else
            {
                expiresAt = DateTime.UtcNow.AddDays(delivery.durationDays > 0 ? delivery.durationDays : 30);
            }

            // Se o jogador já tem VIP ativo do mesmo plano, acumula 30 dias a mais
            if (data.ActiveVips.TryGetValue(steamId, out var existingVip) && existingVip.IsActive && existingVip.Tier == tier && existingVip.ExpiresAt > DateTime.UtcNow)
            {
                expiresAt = existingVip.ExpiresAt.AddDays(delivery.durationDays > 0 ? delivery.durationDays : 30);
            }

            var record = new VipRecord
            {
                SteamId = steamId,
                PlayerName = finalPlayerName,
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

            // Executa comandos adicionais de ativação se configurados
            if (config.ActivationCommands.ContainsKey(tier))
            {
                foreach (var cmd in config.ActivationCommands[tier])
                {
                    if (!string.IsNullOrEmpty(cmd))
                    {
                        ConsoleSystem.Run(ConsoleSystem.Option.Server, cmd.Replace("{steamid}", steamId).Replace("{player}", finalPlayerName));
                    }
                }
            }

            // Avisa o servidor e o jogador
            bool isKit = tier == "farmer" || tier == "airdrop" || tier == "cartao" || tier == "eletrica";
            string nomePacote;
            if (tier == "farmer") nomePacote = "Kit Farmer";
            else if (tier == "airdrop") nomePacote = "Kit Airdrop";
            else if (tier == "cartao") nomePacote = "Kit Cartões";
            else if (tier == "eletrica") nomePacote = "Kit Elétrica";
            else if (tier == "bronze") nomePacote = "VIP Bronze";
            else if (tier == "prata") nomePacote = "VIP Prata";
            else if (tier == "ouro") nomePacote = "VIP Ouro";
            else nomePacote = $"VIP {char.ToUpper(tier[0]) + tier.Substring(1)}";

            PrintToChat($"{config.ChatPrefix} O jogador <color=#10B981>{record.PlayerName}</color> adquiriu o pacote <color=#F59E0B>{nomePacote}</color>! Agradecemos pelo apoio!");

            if (player != null && player.IsConnected)
            {
                string beneficio = isKit ? "seus kits exclusivos" : "seus itens e aproveite a fila prioritária";
                PrintToChat(player, $"{config.ChatPrefix} <color=#10B981>Parabéns!</color> Seu <color=#F59E0B>{nomePacote}</color> foi ativado com sucesso!\n" +
                                   $"- Validade: <color=#38BDF8>30 dias</color> (Expira em: {expiresAt.ToLocalTime():dd/MM/yyyy HH:mm})\n" +
                                   $"- Use <color=#F59E0B>/kit</color> para resgatar {beneficio}!");
            }

            Puts($"[HorizonVIP] ✔ {nomePacote} concedido com sucesso para {record.PlayerName} ({steamId}) por 30 dias (até {expiresAt:yyyy-MM-dd HH:mm}).");

            // Confirma entrega na API do site para finalizar o pedido
            ConfirmDelivery(delivery.orderId);
        }

        // ---------------------------------------------------------------
        // CONFIRMAÇÃO NA API DO SITE
        // ---------------------------------------------------------------
        private void ConfirmDelivery(string orderId)
        {
            if (string.IsNullOrEmpty(orderId)) return;

            string url = $"{config.ApiBaseUrl.TrimEnd('/')}/api/vip/confirm";
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

        // ---------------------------------------------------------------
        // VERIFICAÇÃO AUTOMÁTICA DE EXPIRAÇÃO (APÓS 30 DIAS)
        // ---------------------------------------------------------------
        private void CheckVipExpirations()
        {
            if (data == null || data.ActiveVips == null || data.ActiveVips.Count == 0) return;

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

        // ---------------------------------------------------------------
        // REMOÇÃO AUTOMÁTICA DO VIP
        // ---------------------------------------------------------------
        public void RevokeVip(string steamId, string motivo = "Expirado")
        {
            if (!data.ActiveVips.TryGetValue(steamId, out var record)) return;

            string tier = (record.Tier ?? "bronze").ToLower();
            string groupName = config.VipGroups.ContainsKey(tier) ? config.VipGroups[tier] : $"vip_{tier}";

            // Remove o grupo Oxide
            if (permission.GroupExists(groupName))
            {
                permission.RemoveUserGroup(steamId, groupName);
            }

            // Revoga permissões
            if (config.TierPermissions.ContainsKey(tier))
            {
                foreach (var perm in config.TierPermissions[tier])
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

            string tierFormatado = char.ToUpper(tier[0]) + tier.Substring(1);
            Puts($"[HorizonVIP] ⌛ VIP {tierFormatado} de {record.PlayerName} ({steamId}) foi REMOVIDO automaticamente. Motivo: {motivo}.");

            BasePlayer player = BasePlayer.Find(steamId);
            if (player != null && player.IsConnected)
            {
                PrintToChat(player, $"{config.ChatPrefix} Seu período de <color=#F59E0B>VIP {tierFormatado} (30 dias)</color> encerrou.\n" +
                                   $"Agradecemos imensamente por ter apoiado o Horizon! Para renovar, acesse nossa loja oficial: <color=#38BDF8>{config.ApiBaseUrl}/loja</color>");
            }
        }

        // ---------------------------------------------------------------
        // HOOK: Jogador conecta — avisa sobre VIP ativo
        // ---------------------------------------------------------------
        private void OnPlayerConnected(BasePlayer player)
        {
            if (player == null || player.IsNpc) return;
            string id = player.UserIDString;

            // Checa entregas pendentes imediatamente quando um jogador conecta
            CheckPendingDeliveries();

            if (data.ActiveVips.TryGetValue(id, out var vip) && vip.IsActive)
            {
                if (DateTime.UtcNow >= vip.ExpiresAt)
                {
                    RevokeVip(id, "Expirado ao reconectar");
                    return;
                }

                var remaining = vip.ExpiresAt - DateTime.UtcNow;
                int dias = remaining.Days;
                int horas = remaining.Hours;

                timer.Once(5f, () =>
                {
                    if (player != null && player.IsConnected)
                    {
                        string tierFormatado = char.ToUpper(vip.Tier[0]) + vip.Tier.Substring(1);
                        PrintToChat(player, $"{config.ChatPrefix} Bem-vindo de volta! Seu <color=#F59E0B>VIP {tierFormatado}</color> está ativo.\n" +
                                           $"Tempo restante: <color=#10B981>{dias} dias e {horas} horas</color>. Bom jogo!");
                    }
                });
            }
        }

        // ---------------------------------------------------------------
        // COMANDOS DE CHAT PARA JOGADORES
        // ---------------------------------------------------------------
        [ChatCommand("vip")]
        private void CmdVip(BasePlayer player, string command, string[] args)
        {
            if (player == null) return;
            string id = player.UserIDString;

            if (args.Length > 0 && args[0].ToLower() == "resgatar")
            {
                PrintToChat(player, $"{config.ChatPrefix} Verificando pagamentos e resgates no Mercado Pago...");
                CheckPendingDeliveries();
                return;
            }

            if (data.ActiveVips.TryGetValue(id, out var vip) && vip.IsActive && vip.ExpiresAt > DateTime.UtcNow)
            {
                var remaining = vip.ExpiresAt - DateTime.UtcNow;
                string tierFormatado = char.ToUpper(vip.Tier[0]) + vip.Tier.Substring(1);

                PrintToChat(player, $"{config.ChatPrefix} <color=#10B981>=== SEU STATUS VIP ===</color>\n" +
                                   $"- Pacote: <color=#F59E0B>VIP {tierFormatado}</color>\n" +
                                   $"- Tempo Restante: <color=#38BDF8>{remaining.Days} dias, {remaining.Hours} horas e {remaining.Minutes} minutos</color>\n" +
                                   $"- Expira em: <color=#E2E8F0>{vip.ExpiresAt.ToLocalTime():dd/MM/yyyy HH:mm}</color>\n" +
                                   $"- Resgatar itens: digite <color=#F59E0B>/kit</color>");
            }
            else
            {
                PrintToChat(player, $"{config.ChatPrefix} Você não possui nenhum pacote VIP ativo no momento.\n" +
                                   $"Adquira seu VIP com ativação imediata via PIX em: <color=#38BDF8>{config.ApiBaseUrl}/loja</color>\n" +
                                   $"Se você acabou de pagar, digite <color=#F59E0B>/vip resgatar</color> para forçar a verificação.");
            }
        }

        // ---------------------------------------------------------------
        // COMANDOS DE CONSOLE / ADMIN
        // ---------------------------------------------------------------
        [ConsoleCommand("vip.grant")]
        private void CcmGrant(ConsoleSystem.Arg arg)
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

            arg.ReplyWith($"[HorizonVIP] VIP {tier} concedido manualmente para {steamId} por {dias} dias.");
        }

        [ConsoleCommand("vip.revoke")]
        private void CcmRevoke(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin) return;
            if (arg.Args == null || arg.Args.Length < 1)
            {
                arg.ReplyWith("Uso: vip.revoke <steamid>");
                return;
            }

            string steamId = arg.GetString(0);
            RevokeVip(steamId, "Revogado por Admin no console");
            arg.ReplyWith($"[HorizonVIP] VIP de {steamId} revogado com sucesso.");
        }

        [ConsoleCommand("vip.list")]
        private void CcmList(ConsoleSystem.Arg arg)
        {
            if (!arg.IsAdmin) return;
            arg.ReplyWith($"=== VIPs ATIVOS NO HORIZON ({data.ActiveVips.Count}) ===");
            foreach (var kv in data.ActiveVips)
            {
                var v = kv.Value;
                var rest = v.ExpiresAt - DateTime.UtcNow;
                arg.ReplyWith($"• {v.PlayerName} ({v.SteamId}) | {v.Tier.ToUpper()} | Restam: {rest.Days}d {rest.Hours}h (Expira: {v.ExpiresAt.ToLocalTime():dd/MM/yyyy HH:mm})");
            }
        }
    }
}

