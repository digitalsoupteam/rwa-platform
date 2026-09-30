import { deployScript, artifacts } from '../rocketh/deploy.js';

export default deployScript(
  async ({ deployViaProxy, execute, get, getOrNull, namedAccounts }) => {
    if (getOrNull('AddressBook')) return;

    const { deployer, signer1, signer2, signer3 } = namedAccounts;

    await deployViaProxy(
      'AddressBook',
      {
        account: deployer,
        artifact: artifacts.AddressBook,
        args: [],
      },
      {
        proxyContract: 'UUPS',
        execute: {
          methodName: 'initialize',
          args: [],
        },
      },
    );

    const addressBook = get('AddressBook');

    await execute(addressBook, {
      functionName: 'addSigner',
      args: [signer1],
      account: deployer,
    });
    await execute(addressBook, {
      functionName: 'addSigner',
      args: [signer2],
      account: deployer,
    });
    await execute(addressBook, {
      functionName: 'addSigner',
      args: [signer3],
      account: deployer,
    });
  },
  { tags: ['AddressBook'] },
);
