pragma solidity 0.8.5;

import "./IBEP20.sol";
import "./SafeMath.sol";

// stake SafemoonCash to earn SmCGov
contract StakeProtocol {

    using SafeMath for uint256;
    
    IBEP20 public SafemoonCash;
    IBEP20 public SmCGov;

    struct StakeInfo {
        uint256 amount;
        uint256 timestamp;
    }
    mapping (address => StakeInfo) public stakes;

    event Stake(address user, uint256 amount);
    event Unstake(address user, uint256 amount);
    event Claim(address user, uint256 amount);


    constructor(address _SafemoonCash, address _SmCGov) {
        SafemoonCash = IBEP20(_SafemoonCash);
        SmCGov = IBEP20(_SmCGov);
    }

    function stakerReward(address _staker) public view returns(uint256) {
        StakeInfo memory _info = stakes[_staker];
        return block.timestamp.sub(_info.timestamp).mul(_info.amount).div(86400);
    }

    function claim() public {
        uint256 _stakerReward = stakerReward(msg.sender);
        if(_stakerReward > 0) {
            SmCGov.transfer(msg.sender, _stakerReward);

            StakeInfo storage info = stakes[msg.sender];
            info.timestamp = block.timestamp;

            emit Claim(msg.sender, _stakerReward);
        }
    }

    function stake(uint256 _amount) external {
        require(_amount != 0, "InvalidAmount");

        claim();
        SafemoonCash.transferFrom(msg.sender, address(this), _amount);

        StakeInfo storage _info = stakes[msg.sender];
        _info.amount = _info.amount.add(_amount);
        _info.timestamp = block.timestamp;

        emit Stake(msg.sender, _amount);
    }

    function unstake(uint256 _amount) external {
        require(_amount != 0, "InvalidAmount");

        claim();
        SafemoonCash.transfer(msg.sender, _amount);

        StakeInfo storage _info = stakes[msg.sender];
        _info.amount = _info.amount.sub(_amount);

        emit Unstake(msg.sender, _amount);
    }
}