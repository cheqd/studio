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
    logout_button.disabled = true;
    logout_button.innerHTML = 'Log out';
    logout_button.classList.add('btn', 'authorize');
    logout_button.onclick = function () {
        window.location.href = base_url + '/logto/sign-out';
    };
    const auth_pan = document.createElement('div');
    auth_pan.classList.add('auth-wrapper');
    auth_pan.appendChild(login_button);
    auth_pan.appendChild(logout_button);

    const scheme_pan = document.getElementsByClassName('scheme-container')[0];
    scheme_pan.children[0].appendChild(auth_pan);

    fetchUserInfo(login_button, logout_button);
});

async function fetchUserInfo(login_button: HTMLButtonElement, logout_button: HTMLButtonElement) {
    const res = await fetch(`${window.location.origin}/user`);
    if (res.status === 200) { 
        const body = await res.json();
        if (body.isAuthenticated as boolean) {
            login_button.disabled = true;
            logout_button.disabled = false;
        }
    }
}
