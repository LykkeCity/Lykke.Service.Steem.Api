using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace create_account
{
    class Program
    {
        static async Task Main(string[] args)
        {
            if (args.Length < 6)
            {
                Console.WriteLine("Invalid arguments length");
                return;
            }

            if (!Uri.TryCreate(args[0], UriKind.Absolute, out var apiUrl))
            {
                Console.WriteLine("Invalid API URL");
                return;
            }

            if (!Uri.TryCreate(args[1], UriKind.Absolute, out var signFacadeUrl))
            {
                Console.WriteLine("Invalid SignFacade URL");
                return;
            }

            var signFacadeApiKey = args[2];
            if (string.IsNullOrEmpty(signFacadeApiKey))
            {
                Console.WriteLine("SignFacade API key not specified");
                return;
            }

            var creator = args[3];
            if (string.IsNullOrEmpty(creator))
            {
                Console.WriteLine("Creator account name not specified");
                return;
            }

            var creatorActivePrivateKey = args[4];
            if (string.IsNullOrEmpty(creatorActivePrivateKey))
            {
                Console.WriteLine("Creator active private key not specified");
                return;
            }

            var newAccountName = args[5];
            if (string.IsNullOrEmpty(newAccountName))
            {
                Console.WriteLine("New account name not specified");
                return;
            }

            object metadata = null;
            if (args.Length > 6)
            {
                try
                {
                    metadata = JsonConvert.DeserializeObject(args[6]);
                }
                catch
                {
                    Console.WriteLine("Invalid JSON metadata");
                    return;
                }
            }

            var api = new HttpClient { BaseAddress = apiUrl };
            try
            {
                var isAliveResponse = await api.GetAsync("api/isalive");
                isAliveResponse.EnsureSuccessStatusCode();
            }
            catch
            {
                Console.WriteLine("API not available");
                return;
            }

            var signFacade = new HttpClient { BaseAddress = signFacadeUrl };
            try
            {
                var isAliveResponse = await signFacade.GetAsync("api/isalive");
                isAliveResponse.EnsureSuccessStatusCode();
            }
            catch
            {
                Console.WriteLine("Sign facade not available");
                return;
            }

            var createRequestBody = JsonConvert.SerializeObject(new { creator, creatorActivePrivateKey, newAccountName, metadata });
            var createRequest = new StringContent(createRequestBody, Encoding.UTF8, "application/json");
            var createResponse = await api.PostAsync("api/accounts/create", createRequest);
            var createResponseContent = await createResponse.Content.ReadAsStringAsync();

            if (!createResponse.IsSuccessStatusCode)
            {
                Console.WriteLine(createResponseContent);
                return;
            }

            dynamic createResult = JsonConvert.DeserializeObject(createResponseContent);

            await ImportKey(signFacade, signFacadeApiKey, $"{newAccountName}_password", (string)createResult.password, null);
            await ImportKey(signFacade, signFacadeApiKey, $"{newAccountName}_owner", (string)createResult.keys.owner, (string)createResult.keys.ownerPubkey);
            await ImportKey(signFacade, signFacadeApiKey, $"{newAccountName}", (string)createResult.keys.active, (string)createResult.keys.activePubkey);
            await ImportKey(signFacade, signFacadeApiKey, $"{newAccountName}_posting", (string)createResult.keys.posting, (string)createResult.keys.postingPubkey);
            await ImportKey(signFacade, signFacadeApiKey, $"{newAccountName}_memo", (string)createResult.keys.memo, (string)createResult.keys.memoPubkey);

            Console.WriteLine($"{newAccountName} public keys:");
            Console.WriteLine($"\towner\t{(string)createResult.keys.ownerPubkey}");
            Console.WriteLine($"\tactive\t{(string)createResult.keys.activePubkey}");
            Console.WriteLine($"\tposting\t{(string)createResult.keys.postingPubkey}");
            Console.WriteLine($"\tmemo\t{(string)createResult.keys.memoPubkey}");
        }

        static async Task ImportKey(HttpClient signFacade, string signFacadeApiKey, string publicAddress, string privateKey, string addressContext)
        {
            var importRequestBody = JsonConvert.SerializeObject(new { publicAddress, privateKey, addressContext });
            var importRequest = new StringContent(importRequestBody, Encoding.UTF8, "application/json");

            importRequest.Headers.Add("ApiKey", signFacadeApiKey);

            var importResponse = await signFacade.PostAsync("api/Steem/wallets/import", importRequest);

            importResponse.EnsureSuccessStatusCode();
        }
    }
}
