pragma solidity 0.8.5;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20("", "") {
    function mint(address _account, uint256 _amount) public {
        ERC20._mint(_account, _amount);
    }
}