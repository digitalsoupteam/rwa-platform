import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deploy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('RWAImplementation')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deploy('RWAImplementation', {
      account: deployer,
      artifact: artifacts.RWA,
      args: [addressBook.address],
    });

    const rwaImplementation = get('RWAImplementation');

    await execute(addressBook, {
      functionName: 'setRWAImplementation',
      args: [rwaImplementation.address],
      account: deployer,
    });
  },
  { tags: ['RWAImplementation'], dependencies: ['Config'] },
);
