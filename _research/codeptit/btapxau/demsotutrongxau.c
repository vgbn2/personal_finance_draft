#include <stdio.h>
#include <string.h>
#include <ctype.h>
int dem(char s[1000]){
    int n=strlen(s),count=0;
    for(int i=0;i<n;i++){
        if(s[i]!=' '){
            count++;
        }
        while(i<n&&s[i]!=' '){
            i++;
        }
    }
    return count;
}
int main(){
        char s[1000];gets(s);
          int count = 0;
    char *token = strtok(s, " ");
    while(token != NULL){
        ++count;
        token = strtok(NULL, " ");
    }
        printf("%d",dem(s));
return 0;
}