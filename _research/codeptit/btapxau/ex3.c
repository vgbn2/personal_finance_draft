#include <stdio.h>
#include <string.h>
void hoa(char s[1000]){
    for(int i=0;s[i]!='\0';i++){
        if(s[i]>='a'&&s[i]<='z'){
            s[i]-=32;
        }
    }
    printf("%s",s);
}
int main(){
    char s[1000];gets(s);
    hoa(s);
}