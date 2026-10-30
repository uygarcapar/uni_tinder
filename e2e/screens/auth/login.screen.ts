import { BaseScreen } from '../base.screen';
import { Keyboard } from '../../support/driver';

export class LoginScreen extends BaseScreen {
  readonly root = 'login-screen';
  readonly name = 'Giriş';

  async enterCredentials(email: string, password: string): Promise<void> {
    await this.type('login-input-email', email, { hideKeyboard: false });
    await this.type('login-input-password', password);
    await Keyboard.dismissIfOpen();
  }

  async submit(): Promise<void> {
    await this.tap('login-btn-submit');
  }

  async forgotPassword(): Promise<void> {
    await this.tap('login-btn-forgot');
  }

  async toggglePasswordVisibility(): Promise<void> {
    await this.tap('login-btn-toggle-password');
  }
}

export const login = new LoginScreen();
