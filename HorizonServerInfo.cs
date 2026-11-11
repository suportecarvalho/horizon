using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries;
using Oxide.Core.Plugins;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("HorizonServerInfo", "RustHorizon", "1.0.0")]
    [Description("Sincroniza status do servidor (players, wipe, mapa, fps) em tempo real com o site Horizon")]
    public class HorizonServerInfo : RustPlugin
    {
        private Configuration config;
        private Timer syncTimer;
        private Timer debounceTimer;

        public class Configuration
        {
            [JsonProperty("UrlDaApiDoSite")]
            public string ApiUrl { get; set; } = "https://www.rusthorizon.shop/api/status";

            [JsonProperty("IntervaloDeSincronizacaoSegundos")]
            public int SyncIntervalSeconds { get; set; } = 30;

            [JsonProperty("ApiKey")]
            public string ApiKey { get; set; } = "horizon_live_server_secret";

            [JsonProperty("CronogramaWipeMapa")]
            public string MapWipeSchedule { get; set; } = "Toda Sexta às 18:00h";

            [JsonProperty("CronogramaWipeFull")]
            public string FullWipeSchedule { get; set; } = "1ª Quinta-feira do mês às 17:00h";

            [JsonProperty("LimitePorTime")]
            public string TeamLimit { get; set; } = "Horizon 2x (Max 4)";

            [JsonProperty("LogarSincronizacaoNoConsole")]
            public bool LogSyncToConsole { get; set; } = false;
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

        protected override void SaveConfig() => Config.WriteObject(config, true);

        private void OnServerInitialized()
        {
            LoadConfig();

            // Sincroniza imediatamente na inicialização
            timer.Once(3f, () => SyncServerStatus("Inicialização do Servidor"));

            // Agendar sincronização periódica (padrão a cada 30 segundos)
            int interval = Math.Max(15, config.SyncIntervalSeconds);
            syncTimer = timer.Every(interval, () => SyncServerStatus("Rotina Periódica"));

            Puts($"[HorizonServerInfo] Ativado! Sincronizando com '{config.ApiUrl}' a cada {interval}s.");
        }

        private void Unload()
        {
            if (syncTimer != null)
            {
                syncTimer.Destroy();
                syncTimer = null;
            }
            if (debounceTimer != null)
            {
                debounceTimer.Destroy();
                debounceTimer = null;
            }
        }

        // Detecta novo wipe imediatamente quando um save novo é criado
        private void OnNewSave(string filename)
        {
            Puts($"[HorizonServerInfo] Novo wipe detectado (Save: {filename})! Sincronizando com o site...");
            timer.Once(5f, () => SyncServerStatus("Novo Wipe Detectado"));
        }

        // Quando jogador entra ou sai, sincroniza com debounce de 4s para não sobrecarregar
        private void OnPlayerConnected(BasePlayer player)
        {
            ScheduleDebouncedSync();
        }

        private void OnPlayerDisconnected(BasePlayer player, string reason)
        {
            ScheduleDebouncedSync();
        }

        private void ScheduleDebouncedSync()
        {
            if (debounceTimer != null) return;
            debounceTimer = timer.Once(4f, () =>
            {
                debounceTimer = null;
                SyncServerStatus("Mudança de Jogadores");
            });
        }

        // -------------------------------------------------------------
        // CÁLCULO E ENVIO DO STATUS
        // -------------------------------------------------------------
        public void SyncServerStatus(string motivo = "Manual")
        {
            try
            {
                // 1. Wipe timestamp extraído nativamente do Rust SaveRestore
                DateTime wipeDateTime = SaveRestore.SaveCreatedTime.ToUniversalTime();
                long wipedAtMs = new DateTimeOffset(wipeDateTime).ToUnixTimeMilliseconds();

                // 2. Estatísticas do Servidor em Tempo Real
                int players = BasePlayer.activePlayerList != null ? BasePlayer.activePlayerList.Count : 0;
                int maxPlayers = ConVar.Server.maxplayers;
                int queue = 0;
                int joining = 0;

                try
                {
                    if (ServerMgr.Instance != null && ServerMgr.Instance.connectionQueue != null)
                    {
                        queue = ServerMgr.Instance.connectionQueue.Queued;
                        joining = ServerMgr.Instance.connectionQueue.Joining;
                    }
                }
                catch {}

                string serverName = !string.IsNullOrEmpty(ConVar.Server.hostname) ? ConVar.Server.hostname : "Horizon 2x Solo/Duo/Trio";
                string mapName = !string.IsNullOrEmpty(ConVar.Server.level) ? ConVar.Server.level : "Procedural Map";
                int worldSize = ConVar.Server.worldsize;
                int fps = (int)Performance.current.frameRate;
                int entities = BaseNetworkable.serverEntities != null ? BaseNetworkable.serverEntities.Count : 0;

                // 3. Montar payload JSON
                var payload = new
                {
                    online = true,
                    serverName = serverName,
                    map = mapName,
                    worldSize = worldSize,
                    players = players,
                    maxPlayers = maxPlayers,
                    queuePlayers = queue,
                    joiningPlayers = joining,
                    fps = fps,
                    entities = entities,
                    wipedAt = wipedAtMs,
                    wipeDateTimeUtc = wipeDateTime.ToString("o"),
                    schedule = new
                    {
                        mapWipe = config.MapWipeSchedule,
                        fullWipe = config.FullWipeSchedule,
                        type = config.TeamLimit
                    },
                    syncReason = motivo,
                    updatedAt = DateTime.UtcNow.ToString("o")
                };

                string json = JsonConvert.SerializeObject(payload);

                var headers = new Dictionary<string, string>
                {
                    { "Content-Type", "application/json" },
                    { "X-API-KEY", config.ApiKey },
                    { "Bypass-Tunnel-Reminder", "true" },
                    { "User-Agent", "HorizonRustPlugin/1.0" }
                };

                webrequest.Enqueue(config.ApiUrl, json, (code, response) =>
                {
                    if (code == 200)
                    {
                        if (config.LogSyncToConsole)
                        {
                            Puts($"[HorizonServerInfo] Status enviado com sucesso! ({players}/{maxPlayers} players, Wipe: {wipeDateTime.ToLocalTime():dd/MM HH:mm})");
                        }
                    }
                    else
                    {
                        Puts($"[HorizonServerInfo] Erro ao sincronizar status com '{config.ApiUrl}' (HTTP {code}): {response}");
                    }
                }, this, RequestMethod.POST, headers);
            }
            catch (Exception ex)
            {
                Puts($"[HorizonServerInfo] Falha ao processar status: {ex.Message}");
            }
        }

        // -------------------------------------------------------------
        // COMANDOS DE CONSOLE (ADMIN)
        // -------------------------------------------------------------
        [ConsoleCommand("horizon.status")]
        private void CmdStatus(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !arg.Player().IsAdmin)
            {
                arg.ReplyWith("Apenas administradores podem executar este comando.");
                return;
            }

            SyncServerStatus("Comando Admin horizon.status");
            arg.ReplyWith($"[HorizonServerInfo] Status do servidor enviado para o site com sucesso!");
        }
    }
}

