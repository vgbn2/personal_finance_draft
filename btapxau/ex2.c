#include <stdio.h>
#include <string.h>
int thuong(char s[1000]){
    for(int i=0;i<s[i]!='\0';i++){
        if(s[i]>='A'&&s[i]<='Z')return 1;
        if(s[i]>='a'&&s[i]<='z')return 1;
    }
    return 0;
}
int main(){
    char s[1000];
    scanf("%s",s);
    printf("%d",thuong(s));
}