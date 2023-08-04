"use strict";

window.addEventListener("load", function () {
    const base_url = window.location.origin;
    const login_button = document.createElement('button');
    login_button.innerHTML = 'Log in';
    login_button.classList.add('btn', 'authorize');
    login_button.onclick = function () {
        window.location.href = base_url + '/logto/sign-in';
    };
    const logout_button = document.createElement('button');
    logout_button.innerHTML = 'Log out';
    logout_button.classList.add('btn', 'authorize');
    logout_button.onclick = function () {
        window.location.href = base_url + '/logto/sign-out';
    };
    const auth_pan = document.createElement('div');
    auth_pan.classList.add('auth-wrapper');
    auth_pan.appendChild(login_button);

    const scheme_pan = document.getElementsByClassName('scheme-container')[0];
    scheme_pan.children[0].appendChild(auth_pan);

    isAuthenticated().then(function(value) {
        if (value) {
            auth_pan.removeChild(login_button);
            auth_pan.appendChild(logout_button);
        }
    });
});

async function isAuthenticated() {
    const res = await fetch(`${window.location.origin}/auth/user-info`);
    const body = await res.json();
    return body.isAuthenticated as boolean;
}
