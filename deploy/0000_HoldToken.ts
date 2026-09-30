import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deploy, getOrNull, namedAccounts }) => {
    if (getOrNull('HoldToken')) return;

    const { deployer } = namedAccounts;

    await deploy('HoldToken', {
      account: deployer,
      artifact: artifacts.HoldToken,
      args: [],
    });
  },
  { tags: ['HoldToken'] },
);
