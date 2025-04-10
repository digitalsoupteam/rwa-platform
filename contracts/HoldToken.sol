// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract HoldToken is ERC20 {
    constructor() ERC20("USDT", "USD Test") {
        _mint(msg.sender, 1_000_000_000_000_000 * 1e18);
    }
}
