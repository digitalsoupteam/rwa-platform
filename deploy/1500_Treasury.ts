import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('Treasury')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deployViaProxy(
      'Treasury',
      {
        account: deployer,
        artifact: artifacts.Treasury,
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

    const treasury = get('Treasury');

    await execute(addressBook, {
      functionName: 'setTreasury',
      args: [treasury.address],
      account: deployer,
    });
  },
  { tags: ['Treasury'], dependencies: ['Timelock'] },
);
