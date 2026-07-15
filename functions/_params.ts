// Shared installation-parameter access for App Functions.
//
// The Functions runtime surfaces installation parameters flat on
// context.appInstallationParameters. Some installs historically stored the
// OpenAI key nested under { private: { openAiApiKey } } (set via CLI), so we
// check both shapes — half the functions used to read only one and silently
// broke depending on how the key was installed.
export function getOpenAiApiKey(context: { appInstallationParameters?: unknown }): string {
  const params = (context.appInstallationParameters ?? {}) as any;
  return params.openAiApiKey ?? params.private?.openAiApiKey ?? '';
}
