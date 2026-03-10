#include <stdio.h>
#include <string.h>
#include <ctype.h>
//chữ đầu hoa,tất cả chữ sau thường
void chuanhoa(char s[1000]){
    s[0]=toupper(s[0]);
    for(int i=1;i<strlen(s);i++){
        s[i]=tolower(s[i]);
    }
}
//toàn bộ là hoa
void to_upper(char s[1000]){
    for(int i=0;s[i];i++){
        s[i]=toupper(s[i]);
    }

}
int main(){
    char s[1000],name[100][100];
    gets(s);int count=0;

    char *to=strtok(s," ");
    while(to!=NULL){
        strcpy(name[count],to);
        count++;
        to=strtok(NULL," ");
    }
    //đếm số từ
    to_upper(name[count-1]);
    printf("%s,",name[count-1]);
    //chuyển từ cuối cùng thành chữ hoa và in ra

    for(int i=0;i<count-1;i++){
        chuanhoa(name[i]);
        printf("%s",name[i]);
        if(i!=count-2)printf(" ");//count=3=>i!=1 thì in " "
    }
    //in tên được chuẩn hóa
    printf("\n");
    return 0;
}