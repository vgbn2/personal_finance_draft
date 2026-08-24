export async function handleBotCommand(args: string[]): Promise<any> {
  const sub = args[0];
  console.log(`[COMMAND:BOT] Handling bot subcommand '${sub}'`);
  return { ok: true, sub };
}
