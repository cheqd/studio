window.addEventListener("load", function () {

    var base_url = window.location.origin;

    var login_button = document.createElement('button');
    login_button.innerHTML = 'Log in';
    login_button.classList.add('btn', 'authorize');
    login_button.onclick = function () {
        window.location.href = base_url + '/logto/sign-in';
    }

    var user_button = document.createElement('button');
    user_button.innerHTML = 'User info';
    user_button.classList.add('btn', 'authorize');
    user_button.onclick = function () {
        window.location.href = base_url + '/user';
    }

    var logout_button = document.createElement('button');
    logout_button.innerHTML = 'Log out';
    logout_button.classList.add('btn', 'authorize');
    logout_button.onclick = function () {
        window.location.href = base_url + '/logto/sign-out';
    }

    var auth_pan = document.getElementsByClassName('auth-wrapper')[0];
    auth_pan.appendChild(login_button);
    auth_pan.appendChild(user_button);
    auth_pan.appendChild(logout_button);
});