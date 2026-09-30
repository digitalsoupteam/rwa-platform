import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deploy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('PoolImplementation')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deploy('PoolImplementation', {
      account: deployer,
      artifact: artifacts.Pool,
      args: [addressBook.address],
    });

    const poolImplementation = get('PoolImplementation');

    await execute(addressBook, {
      functionName: 'setPoolImplementation',
      args: [poolImplementation.address],
      account: deployer,
    });
  },
  { tags: ['PoolImplementation'], dependencies: ['Config'] },
);
