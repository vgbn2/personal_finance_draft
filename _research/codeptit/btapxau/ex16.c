#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdlib.h>
void tolow(char s[1000]){
    for(int i=0;s[i]!='\0';i++){
        s[i]=tolower(s[i]);
    }
}
int main(){
    char s[1000],a[100][100];
    gets(s);
  int count=0;
     char *token = strtok(s, " ");
        while (token != NULL) {
            strcpy(a[count], token);
            count++;
            token = strtok(NULL, " ");
        }

}