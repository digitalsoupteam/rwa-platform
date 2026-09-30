import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('EventEmitter')) return;

    const { deployer } = namedAccounts;

    const addressBook = get('AddressBook');

    await deployViaProxy(
      'EventEmitter',
      {
        account: deployer,
        artifact: artifacts.EventEmitter,
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

    const eventEmitter = get('EventEmitter');

    await execute(addressBook, {
      functionName: 'setEventEmitter',
      args: [eventEmitter.address],
      account: deployer,
    });
  },
  { tags: ['EventEmitter'], dependencies: ['AddressBook'] },
);
