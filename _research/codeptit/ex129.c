#include <stdio.h>
#include <string.h>

int main()
{
    char s1[100];
    gets(s1);
    char s2[100];
    scanf("%s", s2);
    char a[100][100];
    int len = 0;
    char *p = strtok(s1, " ");
    while (p != NULL)
    {
        strcpy(a[len], p);//cop string 1 vào 2
        p = strtok(NULL, " ");
        len++;
    }
    for (int i = 0; i < len; i++)
        if (strcmp(a[i], s2) != 0)//chỉ in ra từ khác nhaunhau
            printf("%s ", a[i]);
    return 0;
}