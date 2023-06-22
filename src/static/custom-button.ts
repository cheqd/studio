window.addEventListener("load", function () {
    const base_url: string = window.location.origin;
  
    const login_button: HTMLButtonElement = document.createElement('button');
    login_button.innerHTML = 'Log in';
    login_button.classList.add('btn', 'authorize');
    login_button.onclick = function () {
      window.location.href = base_url + '/logto/sign-in';
    };
  
    const user_button: HTMLButtonElement = document.createElement('button');
    user_button.innerHTML = 'User info';
    user_button.classList.add('btn', 'authorize');
    user_button.onclick = function () {
      window.location.href = base_url + '/user';
    };
  
    const logout_button: HTMLButtonElement = document.createElement('button');
    logout_button.innerHTML = 'Log out';
    logout_button.classList.add('btn', 'authorize');
    logout_button.onclick = function () {
      window.location.href = base_url + '/logto/sign-out';
    };
  
    const auth_pan: Element = document.getElementsByClassName('auth-wrapper')[0];
    auth_pan.appendChild(login_button);
    auth_pan.appendChild(user_button);
    auth_pan.appendChild(logout_button);
  });
  