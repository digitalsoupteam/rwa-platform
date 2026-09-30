import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('Factory')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deployViaProxy(
      'Factory',
      {
        account: deployer,
        artifact: artifacts.Factory,
        args: [],
      },
      {
        proxyContract: 'UUPS',
        execute: {
          methodName: 'initialize',
          args: [addressBook.address],
        },
      },
    );

    const factory = get('Factory');

    await execute(addressBook, {
      functionName: 'setFactory',
      args: [factory.address],
      account: deployer,
    });
  },
  { tags: ['Factory'], dependencies: ['RWAImplementation'] },
);
